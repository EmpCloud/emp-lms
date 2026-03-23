import { describe, it, expect, vi } from "vitest";
import { lmsEvents } from "./index";

describe("LMSEventEmitter", () => {
  it("should emit and receive course.created event", () => {
    const handler = vi.fn();
    lmsEvents.on("course.created", handler);

    const payload = { courseId: "c1", orgId: 1, title: "Test", createdBy: 10 };
    lmsEvents.emit("course.created", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    lmsEvents.off("course.created", handler);
  });

  it("should emit and receive enrollment.completed event", () => {
    const handler = vi.fn();
    lmsEvents.on("enrollment.completed", handler);

    const payload = {
      enrollmentId: "e1",
      courseId: "c1",
      userId: 5,
      orgId: 1,
      completedAt: new Date(),
      score: 95,
    };
    lmsEvents.emit("enrollment.completed", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    lmsEvents.off("enrollment.completed", handler);
  });

  it("should support once listeners", () => {
    const handler = vi.fn();
    lmsEvents.once("quiz.passed", handler);

    const payload = {
      quizAttemptId: "qa1",
      quizId: "q1",
      courseId: "c1",
      userId: 5,
      orgId: 1,
      score: 85,
      passingScore: 70,
    };

    lmsEvents.emit("quiz.passed", payload);
    lmsEvents.emit("quiz.passed", payload);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("should remove listeners with off", () => {
    const handler = vi.fn();
    lmsEvents.on("certificate.issued", handler);
    lmsEvents.off("certificate.issued", handler);

    lmsEvents.emit("certificate.issued", {
      certificateId: "cert1",
      courseId: "c1",
      userId: 5,
      orgId: 1,
      issuedAt: new Date(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("should remove all listeners for a specific event", () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    lmsEvents.on("compliance.overdue", handler1);
    lmsEvents.on("compliance.overdue", handler2);

    lmsEvents.removeAllListeners("compliance.overdue");

    lmsEvents.emit("compliance.overdue", {
      complianceId: "comp1",
      courseId: "c1",
      userId: 5,
      orgId: 1,
      dueDate: new Date(),
    });

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it("should report listener count", () => {
    const handler = vi.fn();
    lmsEvents.on("course.archived", handler);

    expect(lmsEvents.listenerCount("course.archived")).toBe(1);

    lmsEvents.off("course.archived", handler);
    expect(lmsEvents.listenerCount("course.archived")).toBe(0);
  });

  it("should handle multiple different event types", () => {
    const courseHandler = vi.fn();
    const quizHandler = vi.fn();

    lmsEvents.on("course.published", courseHandler);
    lmsEvents.on("quiz.submitted", quizHandler);

    lmsEvents.emit("course.published", {
      courseId: "c1",
      orgId: 1,
      title: "Test",
      publishedBy: 10,
    });

    expect(courseHandler).toHaveBeenCalledTimes(1);
    expect(quizHandler).not.toHaveBeenCalled();

    lmsEvents.off("course.published", courseHandler);
    lmsEvents.off("quiz.submitted", quizHandler);
  });
});
