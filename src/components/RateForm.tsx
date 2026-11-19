"use client";

import { startTransition, useActionState, useEffect } from "react";
import { celebrate } from "./creditHold";
import { rateGame } from "@/app/actions";
import { StarPicker } from "./StarPicker";

/** Uber-style: rate with stars (words optional), or skip. Either one plays the +1 credit moment. */
export function RateForm({ taskId, game }: { taskId: string; game: string }) {
  const [state, action, pending] = useActionState(rateGame, undefined);
  const done = !!state?.ok;
  useEffect(() => {
    if (done) celebrate(taskId, game);
  }, [done, taskId, game]);
  if (state?.ok) return <p className="text-sm text-verified">{state.ok}</p>;
  const send = (fd: FormData) => startTransition(() => action(fd));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send(new FormData(e.currentTarget));
      }}
      className="space-y-3"
    >
      <input type="hidden" name="taskId" value={taskId} />
      <p className="text-sm">How was <b>{game}</b>?</p>
      <StarPicker name="rating" />
      <textarea name="feedback" aria-label="Feedback (optional)" rows={2} maxLength={2000} className="input" placeholder="Anything for the dev? (optional)" />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send rating"}</button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const fd = new FormData();
            fd.set("taskId", taskId);
            fd.set("skip", "1");
            send(fd);
          }}
          className="link"
        >
          Skip
        </button>
        <span className="text-xs text-faint">Shows on the game&apos;s page.</span>
      </div>
    </form>
  );
}
