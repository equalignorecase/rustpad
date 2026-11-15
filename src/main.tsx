import ReactDOM from "react-dom/client";
import App from "./App";
import { isMac } from "./utils/platform";

document.documentElement.dataset.platform = isMac ? "macos" : "windows";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
