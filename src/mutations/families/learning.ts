import { replacementMutations, syntheticTemplate } from "./helpers.js";

export const learningTemplate = syntheticTemplate({
  familyId: "owned-learning-platform-v1",
  name: "Owned Learning Platform",
  description:
    "A Riven-authored course player with lessons, quizzes, enrollment-scoped progress, transcripts, and completion tracking.",
  split: "validation",
  files: {
    "app/courses/[courseId]/page.tsx": `import { loadCourse } from "../../../lib/courses";
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params; const course = await loadCourse(courseId);
  return <main><h1>{course.title}</h1><ol>{course.lessons.map((lesson) => <li key={lesson.id}>{lesson.title}</li>)}</ol></main>;
}
`,
    "components/lesson-video.tsx": `export function LessonVideo({ src, captions }: { src: string; captions: string }) {
  return <video controls preload="metadata"><source src={src} type="video/mp4" /><track kind="captions" src={captions} srcLang="en" label="English" default /></video>;
}
`,
    "components/quiz.tsx": `"use client";
export function Quiz() { return <form><fieldset><legend>Choose the correct answer</legend><label><input type="radio" name="answer" value="a" required />Option A</label><button type="submit">Check answer</button></fieldset></form>; }
`,
    "app/progress/actions.ts": `"use server";
import { revalidatePath } from "next/cache"; import { requireStudent } from "../../lib/session";
export async function completeLesson(courseId: string, percent: number) {
  const student = await requireStudent(); if (!student) throw new Error("unauthorized");
  if (percent < 0 || percent > 100) throw new Error("invalid progress");
  revalidatePath(\`/courses/\${courseId}\`);
}
`,
    "app/api/courses/[courseId]/progress/route.ts": `import { NextResponse } from "next/server"; import { requireStudent } from "../../../../../../lib/session";
export async function GET(_request: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const student = await requireStudent(); if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { courseId } = await params; return NextResponse.json({ courseId, percent: 50 });
}
`,
    "lib/courses.ts": `export async function loadCourse(courseId: string) {
  if (!/^[a-z0-9-]+$/.test(courseId)) throw new Error("invalid course");
  const response = await fetch(\`https://fixture.invalid/courses/\${courseId}\`, { cache: "force-cache" });
  if (!response.ok) throw new Error("course unavailable");
  return { title: "Agent foundations", lessons: [{ id: "l1", title: "Environments" }] };
}
`,
    "lib/session.ts": `export async function requireStudent() { return { id: "student-1" }; }
`,
  },
});

export const learningMutations = replacementMutations([
  {
    mutationId: "learning-route-params",
    category: "nextjs",
    difficulty: "medium",
    issueStatement: "Course params are read before resolution.",
    changedPath: "app/courses/[courseId]/page.tsx",
    before: "const { courseId } = await params",
    after: "const { courseId } = params",
  },
  {
    mutationId: "learning-lesson-key",
    category: "react",
    difficulty: "medium",
    issueStatement: "Lessons use mutable titles as keys.",
    changedPath: "app/courses/[courseId]/page.tsx",
    before: "key={lesson.id}",
    after: "key={lesson.title}",
  },
  {
    mutationId: "learning-video-controls",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Learners cannot control video playback.",
    changedPath: "components/lesson-video.tsx",
    before: " controls",
    after: "",
  },
  {
    mutationId: "learning-captions",
    category: "accessibility",
    difficulty: "hard",
    issueStatement: "Lesson video captions were removed.",
    changedPath: "components/lesson-video.tsx",
    before:
      '<track kind="captions" src={captions} srcLang="en" label="English" default />',
    after: "",
  },
  {
    mutationId: "learning-quiz-legend",
    category: "accessibility",
    difficulty: "easy",
    issueStatement: "Quiz answers lost their group question.",
    changedPath: "components/quiz.tsx",
    before: "<legend>Choose the correct answer</legend>",
    after: "",
  },
  {
    mutationId: "learning-answer-required",
    category: "correctness",
    difficulty: "easy",
    issueStatement: "Quizzes can be submitted without an answer.",
    changedPath: "components/quiz.tsx",
    before: " required",
    after: "",
  },
  {
    mutationId: "learning-progress-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Progress can be updated without a student session.",
    changedPath: "app/progress/actions.ts",
    before: ' if (!student) throw new Error("unauthorized");',
    after: "",
  },
  {
    mutationId: "learning-progress-bound",
    category: "correctness",
    difficulty: "medium",
    issueStatement: "Progress accepts percentages outside 0-100.",
    changedPath: "app/progress/actions.ts",
    before:
      '  if (percent < 0 || percent > 100) throw new Error("invalid progress");\n',
    after: "",
  },
  {
    mutationId: "learning-progress-route-auth",
    category: "security",
    difficulty: "hard",
    issueStatement: "Private course progress is exposed anonymously.",
    changedPath: "app/api/courses/[courseId]/progress/route.ts",
    before:
      ' if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });',
    after: "",
  },
  {
    mutationId: "learning-course-id",
    category: "security",
    difficulty: "medium",
    issueStatement: "Course identifiers are fetched without validation.",
    changedPath: "lib/courses.ts",
    before:
      '  if (!/^[a-z0-9-]+$/.test(courseId)) throw new Error("invalid course");\n',
    after: "",
  },
]);
