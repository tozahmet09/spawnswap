import { CheckCircle2, Clapperboard } from "lucide-react";

/** One line on where a game is in the TikTok video line: "#3 in line" or "Played on TikTok". */
export function VideoStatus({ tested, videoUrl, place, archived }: { tested: boolean; videoUrl?: string | null; place?: number; archived?: boolean }) {
  if (tested)
    return (
      <p className="inline-flex flex-wrap items-center gap-1.5 text-sm text-cream">
        <CheckCircle2 className="h-4 w-4 text-lime" aria-hidden /> Played on our TikTok
        {videoUrl && (
          <a href={videoUrl} target="_blank" rel="noopener" className="text-lime underline-offset-4 hover:underline">
            Watch the video
          </a>
        )}
      </p>
    );
  if (archived || !place) return <p className="text-sm text-faint">Not in the video line while archived.</p>;
  return (
    <p className="inline-flex items-center gap-1.5 text-sm text-cream">
      <Clapperboard className="h-4 w-4 text-lime" aria-hidden />
      <span><b className="font-semibold text-lime tabular-nums">#{place}</b> in line for a TikTok video</span>
    </p>
  );
}
