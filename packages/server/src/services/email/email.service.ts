// ============================================================================
// EMAIL SERVICE
// Sends LMS-related emails via SMTP using Nodemailer + Handlebars templates.
// ============================================================================

import nodemailer from "nodemailer";
import Handlebars from "handlebars";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../../config/index";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Transporter singleton
// ---------------------------------------------------------------------------

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth:
        config.email.user && config.email.password
          ? { user: config.email.user, pass: config.email.password }
          : undefined,
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

const TEMPLATE_DIR = join(__dirname, "../../templates/emails");

function loadTemplate(name: string): HandlebarsTemplateDelegate | null {
  const filePath = join(TEMPLATE_DIR, `${name}.hbs`);
  if (!existsSync(filePath)) {
    logger.warn(`Email template not found: ${filePath}`);
    return null;
  }
  const source = readFileSync(filePath, "utf-8");
  return Handlebars.compile(source);
}

function loadBaseTemplate(): HandlebarsTemplateDelegate | null {
  return loadTemplate("base");
}

function renderWithBase(bodyHtml: string): string {
  const base = loadBaseTemplate();
  if (base) {
    return base({ body: new Handlebars.SafeString(bodyHtml) });
  }
  return bodyHtml;
}

// ---------------------------------------------------------------------------
// Core send function
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string | string[],
  subject: string,
  html: string
): Promise<void> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: config.email.from || "lms@empcloud.com",
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Enrollment email
// ---------------------------------------------------------------------------

export async function sendEnrollmentEmail(
  email: string,
  firstName: string,
  data: { courseId: string; courseTitle?: string }
): Promise<void> {
  const template = loadTemplate("enrollment");
  const html = template
    ? template({ firstName, courseTitle: data.courseTitle || "a new course" })
    : `<p>Hi ${firstName},</p><p>You have been enrolled in a new course.</p>`;

  await sendEmail(email, "You've been enrolled in a new course!", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// Completion email
// ---------------------------------------------------------------------------

export async function sendCompletionEmail(
  email: string,
  firstName: string,
  data: { courseId: string; courseTitle?: string; score?: number }
): Promise<void> {
  const template = loadTemplate("completion");
  const html = template
    ? template({ firstName, courseTitle: data.courseTitle || "the course", score: data.score })
    : `<p>Hi ${firstName},</p><p>Congratulations on completing the course!</p>`;

  await sendEmail(email, "Course Completed! Congratulations!", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// Certificate email
// ---------------------------------------------------------------------------

export async function sendCertificateEmail(
  email: string,
  firstName: string,
  data: { certificateId: string; courseTitle?: string }
): Promise<void> {
  const template = loadTemplate("certificate");
  const html = template
    ? template({ firstName, courseTitle: data.courseTitle || "the course" })
    : `<p>Hi ${firstName},</p><p>Your certificate has been issued.</p>`;

  await sendEmail(email, "Your Certificate is Ready!", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// Compliance reminder email
// ---------------------------------------------------------------------------

export async function sendComplianceReminderEmail(
  email: string,
  firstName: string,
  data: { courseTitle?: string; dueDate?: string }
): Promise<void> {
  const template = loadTemplate("compliance-reminder");
  const html = template
    ? template({ firstName, courseTitle: data.courseTitle || "a compliance course", dueDate: data.dueDate })
    : `<p>Hi ${firstName},</p><p>Reminder: You have a compliance training due soon.</p>`;

  await sendEmail(email, "Compliance Training Reminder", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// Compliance overdue email
// ---------------------------------------------------------------------------

export async function sendComplianceOverdueEmail(
  email: string,
  firstName: string,
  data: { courseTitle?: string; dueDate?: string }
): Promise<void> {
  const template = loadTemplate("compliance-overdue");
  const html = template
    ? template({ firstName, courseTitle: data.courseTitle || "a compliance course", dueDate: data.dueDate })
    : `<p>Hi ${firstName},</p><p>Your compliance training is overdue. Please complete it immediately.</p>`;

  await sendEmail(email, "Compliance Training OVERDUE", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// ILT reminder email
// ---------------------------------------------------------------------------

export async function sendILTReminderEmail(
  email: string,
  firstName: string,
  data: { sessionTitle?: string; startTime?: string; location?: string }
): Promise<void> {
  const template = loadTemplate("ilt-reminder");
  const html = template
    ? template({ firstName, sessionTitle: data.sessionTitle, startTime: data.startTime, location: data.location })
    : `<p>Hi ${firstName},</p><p>Reminder: You have an upcoming training session.</p>`;

  await sendEmail(email, "Training Session Reminder", renderWithBase(html));
}

// ---------------------------------------------------------------------------
// Quiz result email
// ---------------------------------------------------------------------------

export async function sendQuizResultEmail(
  email: string,
  firstName: string,
  data: { type: string; quizTitle?: string; score?: number; passingScore?: number }
): Promise<void> {
  const passed = data.type === "quiz_passed";
  const subject = passed ? "Quiz Passed!" : "Quiz Result";
  const html = `
    <p>Hi ${firstName},</p>
    <p>Your quiz result for <strong>${data.quizTitle || "the quiz"}</strong>:</p>
    <ul>
      <li>Score: ${data.score ?? "N/A"}%</li>
      <li>Passing Score: ${data.passingScore ?? "N/A"}%</li>
      <li>Result: <strong>${passed ? "PASSED" : "FAILED"}</strong></li>
    </ul>
    ${passed ? "<p>Congratulations!</p>" : "<p>Please review the material and try again.</p>"}
  `;

  await sendEmail(email, subject, renderWithBase(html));
}
