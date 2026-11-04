import { FeedbackProvider } from "@/components/Feedback";
import { Shell } from "@/components/Shell";
import { WorkspaceProvider } from "@/workspace/WorkspaceContext";

export const App = () => (
  <FeedbackProvider>
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  </FeedbackProvider>
);
