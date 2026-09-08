import ClockPage from "@/components/fichar/ClockPage";
import { buildClockState, closeStaleSessions } from "@/lib/fichar-db";

// The clock is live state; nothing here may be cached.
export const dynamic = "force-dynamic";

export default function FicharPage() {
  // Rendering the page server-side with the real state avoids the counters
  // flashing zeros before the first fetch lands.
  closeStaleSessions();
  return <ClockPage initial={buildClockState()} />;
}
