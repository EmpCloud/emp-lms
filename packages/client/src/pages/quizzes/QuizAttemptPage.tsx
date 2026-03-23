import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Clock,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Trophy,
} from "lucide-react";
import toast from "react-hot-toast";
import { useQuiz, useSubmitQuiz } from "@/api/hooks";

type QuestionType = "mcq" | "multi-select" | "true-false" | "fill-blank" | "essay";

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: { id: string; text: string }[];
  correct_answer?: any;
}

interface QuizData {
  id: string;
  title: string;
  time_limit?: number; // in minutes
  passing_score?: number;
  show_answers?: boolean;
  questions: Question[];
}

export default function QuizAttemptPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuiz(id!);
  const submitMutation = useSubmitQuiz();

  const quiz: QuizData | null = (data?.data as QuizData) ?? null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Initialize timer when quiz loads
  useEffect(() => {
    if (quiz?.time_limit && !submitted) {
      setTimeLeft(quiz.time_limit * 60);
    }
  }, [quiz?.time_limit, submitted]);

  // Countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || submitted) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, submitted]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && !submitted) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[currentIndex] ?? null;

  const answeredCount = useMemo(
    () => Object.keys(answers).filter((k) => answers[k] !== undefined && answers[k] !== "").length,
    [answers],
  );

  const setAnswer = useCallback((questionId: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setShowConfirm(false);
    try {
      const res = await submitMutation.mutateAsync({
        quiz_id: id,
        answers: Object.entries(answers).map(([question_id, answer]) => ({
          question_id,
          answer,
        })),
      });
      setResult(res.data);
      setSubmitted(true);
      toast.success("Quiz submitted!");
    } catch {
      toast.error("Failed to submit quiz. Please try again.");
    }
  }, [submitMutation, id, answers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isError || !quiz) {
    return (
      <div className="text-center py-20 text-red-600">Failed to load quiz. Please try again.</div>
    );
  }

  // ── Results screen ──────────────────────────────────────────────────────
  if (submitted && result) {
    const passed = result.passed ?? (result.score >= (quiz.passing_score ?? 70));
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white border rounded-xl p-8 text-center shadow-sm">
          {passed ? (
            <Trophy className="mx-auto h-16 w-16 text-yellow-500 mb-4" />
          ) : (
            <XCircle className="mx-auto h-16 w-16 text-red-500 mb-4" />
          )}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {passed ? "Congratulations!" : "Not Quite"}
          </h2>
          <p className="text-gray-600 mb-6">
            {passed
              ? "You passed the quiz!"
              : "You did not reach the passing score. You can try again."}
          </p>

          <div className="flex items-center justify-center gap-8 mb-8">
            <div>
              <p className="text-3xl font-bold text-gray-900">{result.score ?? 0}%</p>
              <p className="text-sm text-gray-500">Your Score</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{quiz.passing_score ?? 70}%</p>
              <p className="text-sm text-gray-500">Passing Score</p>
            </div>
          </div>

          {/* Correct answers review */}
          {quiz.show_answers && result.review && (
            <div className="text-left border-t pt-6 mt-6 space-y-4">
              <h3 className="font-semibold text-gray-900 mb-3">Answer Review</h3>
              {questions.map((q, idx) => {
                const reviewItem = result.review.find((r: any) => r.question_id === q.id);
                const isCorrect = reviewItem?.correct;
                return (
                  <div key={q.id} className="border rounded-lg p-4">
                    <div className="flex items-start gap-2 mb-1">
                      {isCorrect ? (
                        <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                      )}
                      <p className="text-sm font-medium text-gray-900">
                        {idx + 1}. {q.text}
                      </p>
                    </div>
                    <p className="text-sm text-gray-500 ml-7">
                      Your answer: {String(answers[q.id] ?? "—")}
                    </p>
                    {!isCorrect && reviewItem?.correct_answer != null && (
                      <p className="text-sm text-green-700 ml-7">
                        Correct answer: {String(reviewItem.correct_answer)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => navigate(-1)}
            className="mt-8 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz-taking interface ───────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{quiz.title}</h1>
          <p className="text-sm text-gray-500">
            {answeredCount} of {questions.length} answered
          </p>
        </div>
        {timeLeft !== null && (
          <div
            className={`flex items-center gap-2 text-lg font-mono font-semibold ${
              timeLeft < 60 ? "text-red-600" : "text-gray-900"
            }`}
          >
            <Clock className="h-5 w-5" />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Question pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {questions.map((q, idx) => {
          const isAnswered =
            answers[q.id] !== undefined && answers[q.id] !== "" && answers[q.id] !== null;
          const isCurrent = idx === currentIndex;
          return (
            <button
              key={q.id}
              onClick={() => setCurrentIndex(idx)}
              className={`h-9 w-9 rounded-full text-sm font-medium transition-colors ${
                isCurrent
                  ? "bg-blue-600 text-white"
                  : isAnswered
                    ? "bg-green-100 text-green-700 border border-green-300"
                    : "bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200"
              }`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      {/* Question card */}
      {currentQuestion && (
        <div className="bg-white border rounded-xl p-6 shadow-sm mb-6">
          <p className="text-sm text-gray-500 mb-2">
            Question {currentIndex + 1} of {questions.length}
          </p>
          <p className="text-lg font-medium text-gray-900 mb-6">{currentQuestion.text}</p>

          {/* MCQ */}
          {currentQuestion.type === "mcq" && (
            <div className="space-y-3">
              {currentQuestion.options?.map((opt) => (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    answers[currentQuestion.id] === opt.id
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={currentQuestion.id}
                    value={opt.id}
                    checked={answers[currentQuestion.id] === opt.id}
                    onChange={() => setAnswer(currentQuestion.id, opt.id)}
                    className="accent-blue-600"
                  />
                  <span className="text-gray-800">{opt.text}</span>
                </label>
              ))}
            </div>
          )}

          {/* Multi-select */}
          {currentQuestion.type === "multi-select" && (
            <div className="space-y-3">
              {currentQuestion.options?.map((opt) => {
                const selected: string[] = answers[currentQuestion.id] ?? [];
                const isChecked = selected.includes(opt.id);
                return (
                  <label
                    key={opt.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isChecked
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const next = isChecked
                          ? selected.filter((s) => s !== opt.id)
                          : [...selected, opt.id];
                        setAnswer(currentQuestion.id, next);
                      }}
                      className="accent-blue-600"
                    />
                    <span className="text-gray-800">{opt.text}</span>
                  </label>
                );
              })}
            </div>
          )}

          {/* True / False */}
          {currentQuestion.type === "true-false" && (
            <div className="flex gap-4">
              {["true", "false"].map((val) => (
                <button
                  key={val}
                  onClick={() => setAnswer(currentQuestion.id, val)}
                  className={`flex-1 py-3 rounded-lg font-medium border transition-colors ${
                    answers[currentQuestion.id] === val
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {val.charAt(0).toUpperCase() + val.slice(1)}
                </button>
              ))}
            </div>
          )}

          {/* Fill in the blank */}
          {currentQuestion.type === "fill-blank" && (
            <input
              type="text"
              value={answers[currentQuestion.id] ?? ""}
              onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
              placeholder="Type your answer..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          )}

          {/* Essay */}
          {currentQuestion.type === "essay" && (
            <textarea
              value={answers[currentQuestion.id] ?? ""}
              onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
              placeholder="Write your answer..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
            />
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => setShowConfirm(true)}
            disabled={submitMutation.isPending}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Send className="h-4 w-4" />
            {submitMutation.isPending ? "Submitting..." : "Submit Quiz"}
          </button>
        )}
      </div>

      {/* Confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <AlertTriangle className="mx-auto h-10 w-10 text-yellow-500 mb-3" />
            <h3 className="text-lg font-semibold text-gray-900 text-center mb-2">Submit Quiz?</h3>
            <p className="text-sm text-gray-600 text-center mb-1">
              You have answered {answeredCount} of {questions.length} questions.
            </p>
            {answeredCount < questions.length && (
              <p className="text-sm text-yellow-600 text-center mb-4">
                {questions.length - answeredCount} question(s) are unanswered.
              </p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {submitMutation.isPending ? "Submitting..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
