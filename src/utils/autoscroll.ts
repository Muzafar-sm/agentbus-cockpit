// The conversation view sticks to the end while a turn streams, and repositions
// when the turn ends. These are the pure rules behind that: ConvoColumn reads
// the numbers off the scroll container and feeds them here. Keeping the
// arithmetic out of the component makes it testable without a real layout —
// jsdom gives every element a height of zero, so the component's own measuring
// cannot be exercised there, but these rules can.

// A measure of a scroll container: how far it is scrolled, how tall its content
// is, and how tall its view is, all in pixels.
export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

// How near the end the view must be to count as still following it. A scroll
// that leaves more than this below the fold stops the follow; a scroll back to
// within it starts the follow again. A few pixels of slack cover sub-pixel
// rounding and the container's bottom padding, so a view the code just pinned
// to the end still reads as being at the end.
export const FOLLOW_SLACK_PX = 24;

// The room left above a reply's start when it is brought to the top of the view.
export const REPLY_TOP_PAD_PX = 8;

// The pixels of content below the fold: 0 at the very end, more the further up
// the view sits.
export function distanceFromEnd(m: ScrollMetrics): number {
  return m.scrollHeight - m.scrollTop - m.clientHeight;
}

// Whether the view still follows the end.
export function followsEnd(m: ScrollMetrics, slack = FOLLOW_SLACK_PX): boolean {
  return distanceFromEnd(m) <= slack;
}

// The scrollTop that puts the end of the content at the bottom of the view.
// Never negative: content shorter than the view sits at the top.
export function endTop(m: Pick<ScrollMetrics, 'scrollHeight' | 'clientHeight'>): number {
  return Math.max(0, m.scrollHeight - m.clientHeight);
}

// The scrollTop that brings a just-ended reply into view with its start at the
// top. replyTop is the reply's top edge in the container's scroll coordinates
// (its current distance below the view's top plus the current scrollTop). It
// never scrolls past the end, so a reply shorter than the view, low in a long
// conversation, stays wholly in view rather than being pulled up into empty
// space. So a reply longer than the view starts at the top; a shorter one is
// shown in full.
export function replyStartTop(replyTop: number, m: ScrollMetrics, pad = REPLY_TOP_PAD_PX): number {
  const desired = replyTop - pad;
  return Math.min(Math.max(0, desired), endTop(m));
}
