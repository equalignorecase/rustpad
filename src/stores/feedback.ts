import { create } from "zustand";
export interface Choice {
  value: string;
  label: string;
  kind?: "primary" | "danger";
}
export interface Question {
  title: string;
  description: string;
  choices: Choice[];
  resolve: (answer: string) => void;
}
interface Feedback {
  question: Question | null;
  notifications: { id: number; message: string; error: boolean }[];
  ask: (
    title: string,
    description: string,
    choices: Choice[],
  ) => Promise<string>;
  answer: (value: string) => void;
  notify: (message: string, error?: boolean) => void;
  dismiss: (id: number) => void;
}
let nextId = 0;
export const useFeedback = create<Feedback>((set, get) => ({
  question: null,
  notifications: [],
  ask: (title, description, choices) =>
    new Promise((resolve) => {
      get().question?.resolve("cancel");
      set({ question: { title, description, choices, resolve } });
    }),
  answer: (value) => {
    const question = get().question;
    set({ question: null });
    question?.resolve(value);
  },
  notify: (message, error = false) => {
    const id = ++nextId;
    set((state) => ({
      notifications: [...state.notifications.slice(-3), { id, message, error }],
    }));
    if (!error) setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),
}));
export function report(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  useFeedback.getState().notify(message, true);
}
