import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSendMail = vi.fn().mockResolvedValue({});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "<p>Hi {{firstName}},</p><p>{{courseTitle}}</p>"),
  existsSync: vi.fn(() => true),
}));

vi.mock("handlebars", () => {
  const compileFn = vi.fn((source: string) => {
    return (context: Record<string, any>) => {
      let result = source;
      for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`{{${key}}}`, "g"), String(value));
      }
      return result;
    };
  });
  return {
    default: {
      compile: compileFn,
      SafeString: class {
        value: string;
        constructor(val: string) {
          this.value = val;
        }
        toString() {
          return this.value;
        }
      },
    },
  };
});

vi.mock("../../config/index", () => ({
  config: {
    email: {
      host: "smtp.test.com",
      port: 587,
      user: "testuser",
      password: "testpass",
      from: "test@empcloud.com",
    },
  },
}));

vi.mock("../../utils/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  sendEnrollmentEmail,
  sendCompletionEmail,
  sendCertificateEmail,
  sendComplianceReminderEmail,
  sendComplianceOverdueEmail,
  sendILTReminderEmail,
  sendQuizResultEmail,
} from "./email.service";

import { existsSync } from "fs";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset existsSync to return true by default
  (existsSync as any).mockReturnValue(true);
  mockSendMail.mockResolvedValue({});
});

// -- sendEnrollmentEmail -------------------------------------------------------

describe("sendEnrollmentEmail", () => {
  it("should send enrollment email with correct recipient and subject", async () => {
    await sendEnrollmentEmail("user@test.com", "John", {
      courseId: "c1",
      courseTitle: "TypeScript 101",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "You've been enrolled in a new course!",
      })
    );
  });

  it("should use fallback HTML when template not found", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendEnrollmentEmail("user@test.com", "Jane", {
      courseId: "c1",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        html: expect.stringContaining("Jane"),
      })
    );
  });
});

// -- sendCompletionEmail -------------------------------------------------------

describe("sendCompletionEmail", () => {
  it("should send completion email with correct subject", async () => {
    await sendCompletionEmail("user@test.com", "Alice", {
      courseId: "c1",
      courseTitle: "React Basics",
      score: 95,
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Course Completed! Congratulations!",
      })
    );
  });

  it("should use fallback when template missing", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendCompletionEmail("user@test.com", "Bob", {
      courseId: "c1",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Bob"),
      })
    );
  });
});

// -- sendCertificateEmail ------------------------------------------------------

describe("sendCertificateEmail", () => {
  it("should send certificate email with correct subject", async () => {
    await sendCertificateEmail("user@test.com", "Charlie", {
      certificateId: "cert-1",
      courseTitle: "Advanced Node.js",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Your Certificate is Ready!",
      })
    );
  });

  it("should use fallback HTML when template not found", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendCertificateEmail("user@test.com", "Diane", {
      certificateId: "cert-2",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Diane"),
      })
    );
  });
});

// -- sendComplianceReminderEmail -----------------------------------------------

describe("sendComplianceReminderEmail", () => {
  it("should send compliance reminder with correct subject", async () => {
    await sendComplianceReminderEmail("user@test.com", "Eve", {
      courseTitle: "Safety Training",
      dueDate: "2026-04-01",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Compliance Training Reminder",
      })
    );
  });

  it("should use fallback HTML when template not found", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendComplianceReminderEmail("user@test.com", "Frank", {});

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Frank"),
      })
    );
  });
});

// -- sendComplianceOverdueEmail ------------------------------------------------

describe("sendComplianceOverdueEmail", () => {
  it("should send overdue email with correct subject", async () => {
    await sendComplianceOverdueEmail("user@test.com", "Grace", {
      courseTitle: "OSHA Compliance",
      dueDate: "2026-03-01",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Compliance Training OVERDUE",
      })
    );
  });

  it("should use fallback HTML when template not found", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendComplianceOverdueEmail("user@test.com", "Hank", {});

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Hank"),
      })
    );
  });
});

// -- sendILTReminderEmail ------------------------------------------------------

describe("sendILTReminderEmail", () => {
  it("should send ILT reminder with correct subject", async () => {
    await sendILTReminderEmail("user@test.com", "Irene", {
      sessionTitle: "Workshop A",
      startTime: "2026-04-15T10:00:00Z",
      location: "Room 101",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Training Session Reminder",
      })
    );
  });

  it("should use fallback HTML when template not found", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendILTReminderEmail("user@test.com", "Jack", {});

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("Jack"),
      })
    );
  });
});

// -- sendQuizResultEmail -------------------------------------------------------

describe("sendQuizResultEmail", () => {
  it("should send quiz passed email with correct subject", async () => {
    // Disable base template so raw HTML passes through
    (existsSync as any).mockReturnValue(false);

    await sendQuizResultEmail("user@test.com", "Karen", {
      type: "quiz_passed",
      quizTitle: "Module 1 Quiz",
      score: 90,
      passingScore: 70,
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Quiz Passed!",
        html: expect.stringContaining("PASSED"),
      })
    );
  });

  it("should send quiz failed email with correct subject", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendQuizResultEmail("user@test.com", "Leo", {
      type: "quiz_failed",
      quizTitle: "Final Exam",
      score: 40,
      passingScore: 70,
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Quiz Result",
        html: expect.stringContaining("FAILED"),
      })
    );
  });

  it("should handle missing score gracefully", async () => {
    (existsSync as any).mockReturnValue(false);

    await sendQuizResultEmail("user@test.com", "Mia", {
      type: "quiz_failed",
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining("N/A"),
      })
    );
  });
});

// -- Error handling ------------------------------------------------------------

describe("email error handling", () => {
  it("should throw when sendMail fails", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("SMTP connection failed"));

    await expect(
      sendEnrollmentEmail("user@test.com", "Test", { courseId: "c1" })
    ).rejects.toThrow("SMTP connection failed");
  });
});
