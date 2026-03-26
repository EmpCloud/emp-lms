// ============================================================================
// QUIZ ROUTES
// All quiz endpoints under /api/v1/quizzes
// ============================================================================

import { Router, Request, Response, NextFunction } from "express";
import * as quizService from "../../services/quiz/quiz.service";
import { sendSuccess } from "../../utils/response";
import { authenticate, authorize } from "../middleware/auth.middleware";
import { BadRequestError } from "../../utils/errors";

const router = Router();

const ADMIN_ROLES = ["super_admin", "org_admin", "hr_admin"] as const;

// ---------------------------------------------------------------------------
// Quiz CRUD
// ---------------------------------------------------------------------------

// GET /quizzes/course/:courseId — list quizzes for a course
router.get(
  "/course/:courseId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quizzes = await quizService.listQuizzes(req.params.courseId);
      sendSuccess(res, quizzes);
    } catch (err) {
      next(err);
    }
  }
);

// GET /quizzes/:id — get single quiz (with answers for admin only)
router.get(
  "/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quiz = await quizService.getQuiz(req.params.id);

      // Strip correct answer info for non-admin users
      const isAdmin = ADMIN_ROLES.includes(req.user!.role as any);
      if (!isAdmin && quiz.questions) {
        quiz.questions = quiz.questions.map((q: any) => ({
          ...q,
          options: Array.isArray(q.options)
            ? q.options.map((opt: any) => {
                const { is_correct, ...rest } = opt;
                return rest;
              })
            : q.options,
        }));
      }

      sendSuccess(res, quiz);
    } catch (err) {
      next(err);
    }
  }
);

// GET /quizzes/:id/take — get quiz for taking (no correct answers)
router.get(
  "/:id/take",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quiz = await quizService.getQuizForAttempt(
        req.params.id,
        req.user!.empcloudUserId
      );
      sendSuccess(res, quiz);
    } catch (err) {
      next(err);
    }
  }
);

// POST /quizzes — create quiz
router.post(
  "/",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { course_id, ...data } = req.body;
      if (!course_id) {
        throw new BadRequestError("course_id is required");
      }
      const quiz = await quizService.createQuiz(
        req.user!.empcloudOrgId,
        course_id,
        { course_id, ...data }
      );
      sendSuccess(res, quiz, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /quizzes/:id — update quiz
router.put(
  "/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const quiz = await quizService.updateQuiz(
        req.user!.empcloudOrgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, quiz);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /quizzes/:id — delete quiz
router.delete(
  "/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await quizService.deleteQuiz(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Question CRUD
// ---------------------------------------------------------------------------

// POST /quizzes/:id/questions — add question
router.post(
  "/:id/questions",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const question = await quizService.addQuestion(
        req.user!.empcloudOrgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, question, 201);
    } catch (err) {
      next(err);
    }
  }
);

// PUT /quizzes/questions/:id — update question
router.put(
  "/questions/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const question = await quizService.updateQuestion(
        req.user!.empcloudOrgId,
        req.params.id,
        req.body
      );
      sendSuccess(res, question);
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /quizzes/questions/:id — delete question
router.delete(
  "/questions/:id",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await quizService.deleteQuestion(
        req.user!.empcloudOrgId,
        req.params.id
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// POST /quizzes/:id/questions/reorder — reorder questions
router.post(
  "/:id/questions/reorder",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { ordered_ids } = req.body;
      if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
        throw new BadRequestError("ordered_ids must be a non-empty array");
      }
      const result = await quizService.reorderQuestions(req.params.id, ordered_ids);
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Quiz Attempts
// ---------------------------------------------------------------------------

// POST /quizzes/:id/submit — submit quiz attempt
router.post(
  "/:id/submit",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enrollment_id, answers } = req.body;
      if (!enrollment_id) {
        throw new BadRequestError("enrollment_id is required");
      }
      if (!Array.isArray(answers)) {
        throw new BadRequestError("answers must be an array");
      }
      const result = await quizService.submitQuizAttempt(
        req.user!.empcloudOrgId,
        req.user!.empcloudUserId,
        req.params.id,
        enrollment_id,
        answers
      );
      sendSuccess(res, result);
    } catch (err) {
      next(err);
    }
  }
);

// GET /quizzes/:id/attempts — current user's attempts on this quiz
router.get(
  "/:id/attempts",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attempts = await quizService.getAttempts(
        req.params.id,
        req.user!.empcloudUserId
      );
      sendSuccess(res, attempts);
    } catch (err) {
      next(err);
    }
  }
);

// GET /quizzes/attempts/:id — single attempt detail
router.get(
  "/attempts/:id",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attempt = await quizService.getAttempt(req.params.id);
      sendSuccess(res, attempt);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

// GET /quizzes/:id/stats — quiz statistics (admin)
router.get(
  "/:id/stats",
  authenticate,
  authorize(...ADMIN_ROLES),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await quizService.getQuizStats(req.params.id);
      sendSuccess(res, stats);
    } catch (err) {
      next(err);
    }
  }
);

export { router as quizRoutes };
