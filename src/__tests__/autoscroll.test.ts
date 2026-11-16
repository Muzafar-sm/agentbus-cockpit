import { describe, expect, it } from 'vitest';
import { distanceFromEnd, endTop, followsEnd, FOLLOW_SLACK_PX, replyStartTop, REPLY_TOP_PAD_PX } from '../utils/autoscroll';

// A container 400 tall holding 1000 of content: 600 of scroll between top and end.
const M = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400 };

describe('following the end', () => {
  it('distanceFromEnd is 0 at the end and grows the further up the view sits', () => {
    expect(distanceFromEnd({ ...M, scrollTop: 600 })).toBe(0);
    expect(distanceFromEnd({ ...M, scrollTop: 400 })).toBe(200);
    expect(distanceFromEnd({ ...M, scrollTop: 0 })).toBe(600);
  });

  it('follows the end at the end and within the slack', () => {
    expect(followsEnd({ ...M, scrollTop: 600 })).toBe(true);
    expect(followsEnd({ ...M, scrollTop: 600 - FOLLOW_SLACK_PX })).toBe(true);
  });

  it('stops following once the person scrolls up past the slack', () => {
    // One pixel beyond the slack is a scroll up, so the follow stops.
    expect(followsEnd({ ...M, scrollTop: 600 - FOLLOW_SLACK_PX - 1 })).toBe(false);
    expect(followsEnd({ ...M, scrollTop: 0 })).toBe(false);
  });

  it('follows the end again once the view is scrolled back within the slack', () => {
    expect(followsEnd({ ...M, scrollTop: 100 })).toBe(false);
    expect(followsEnd({ ...M, scrollTop: 595 })).toBe(true);
  });
});

describe('pinning to the end', () => {
  it('endTop puts the end of the content at the bottom of the view', () => {
    expect(endTop(M)).toBe(600);
  });

  it('endTop is 0 when the content is shorter than the view', () => {
    expect(endTop({ scrollHeight: 200, clientHeight: 400 })).toBe(0);
  });
});

describe('a completed reply', () => {
  it('starts at the top when it is longer than the view', () => {
    // A 700-tall reply (longer than the 400 view) that ends the 1000 of
    // content starts at 300. Its start goes to the top, less a little padding.
    const replyTop = 300;
    expect(replyStartTop(replyTop, M)).toBe(300 - REPLY_TOP_PAD_PX);
  });

  it('is shown in full, not pulled up into empty space, when it is shorter than the view', () => {
    // A short reply low in a long conversation: aligning its start to the top
    // would scroll past the end, so it clamps to the end and stays wholly in view.
    const replyTop = 900;
    expect(replyStartTop(replyTop, M)).toBe(endTop(M));
  });

  it('never scrolls above the top of the content', () => {
    const replyTop = 4;
    expect(replyStartTop(replyTop, M)).toBe(0);
  });
});
