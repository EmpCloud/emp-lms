import { describe, it, expect, vi } from "vitest";
import { sendSuccess, sendPaginated, sendError } from "./response";

function createMockRes() {
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe("sendSuccess", () => {
  it("should send 200 by default with success envelope", () => {
    const res = createMockRes();
    sendSuccess(res, { id: "abc" });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: "abc" },
    });
  });

  it("should send custom status code", () => {
    const res = createMockRes();
    sendSuccess(res, { created: true }, 201);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("should handle null data", () => {
    const res = createMockRes();
    sendSuccess(res, null, 204);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: null });
  });
});

describe("sendPaginated", () => {
  it("should send paginated response with correct meta", () => {
    const res = createMockRes();
    const data = [{ id: "1" }, { id: "2" }];
    sendPaginated(res, data, 50, 1, 20);

    expect(res.status).toHaveBeenCalledWith(200);
    const call = res.json.mock.calls[0][0];
    expect(call.success).toBe(true);
    expect(call.data).toEqual(data);
    expect(call.meta).toEqual({
      page: 1,
      limit: 20,
      total: 50,
      totalPages: 3,
    });
  });

  it("should calculate totalPages correctly for exact division", () => {
    const res = createMockRes();
    sendPaginated(res, [], 40, 2, 20);

    const call = res.json.mock.calls[0][0];
    expect(call.meta.totalPages).toBe(2);
  });

  it("should handle zero total", () => {
    const res = createMockRes();
    sendPaginated(res, [], 0, 1, 20);

    const call = res.json.mock.calls[0][0];
    expect(call.meta.totalPages).toBe(0);
    expect(call.data).toEqual([]);
  });
});

describe("sendError", () => {
  it("should send error response", () => {
    const res = createMockRes();
    sendError(res, 404, "NOT_FOUND", "Course not found");

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: { code: "NOT_FOUND", message: "Course not found" },
    });
  });

  it("should include details when provided", () => {
    const res = createMockRes();
    const details = { field: ["required"] };
    sendError(res, 400, "VALIDATION", "Invalid", details);

    const call = res.json.mock.calls[0][0];
    expect(call.error.details).toEqual(details);
  });

  it("should not include details key when not provided", () => {
    const res = createMockRes();
    sendError(res, 500, "SERVER_ERROR", "Oops");

    const call = res.json.mock.calls[0][0];
    expect(call.error).not.toHaveProperty("details");
  });
});
