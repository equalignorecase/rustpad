import { useFeedback } from "../../stores/feedback";
import { Modal } from "../ui/dialog";
export function UnsavedChangesDialog() {
  const question = useFeedback((state) => state.question);
  const answer = useFeedback((state) => state.answer);
  if (!question) return null;
  return (
    <Modal
      title={question.title}
      description={question.description}
      open
      onClose={() => answer("cancel")}
    >
      <div className="dialog-actions">
        {question.choices.map((choice) => (
          <button
            key={choice.value}
            className={`button ${choice.kind ?? ""}`}
            onClick={() => answer(choice.value)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
