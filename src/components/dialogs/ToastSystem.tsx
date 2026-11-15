import { AlertCircle, Check, X } from "lucide-react";
import { useFeedback } from "../../stores/feedback";
export function ToastSystem() {
  const notifications = useFeedback((state) => state.notifications);
  const dismiss = useFeedback((state) => state.dismiss);
  return (
    <div className="toasts" aria-live="polite">
      {notifications.map((item) => (
        <div
          className={`toast ${item.error ? "error" : ""}`}
          key={item.id}
          role={item.error ? "alert" : "status"}
        >
          {item.error ? <AlertCircle size={16} /> : <Check size={16} />}
          <span>{item.message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => dismiss(item.id)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
