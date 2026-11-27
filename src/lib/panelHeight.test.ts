import { describe, expect, test } from "bun:test";
import { DEFAULT_PANEL_H, MIN_PANEL_H, clampPanelHeight, fitPanelHeight, maxPanelHeight } from "./panelHeight";

describe("panel height limits", () => {
  test("the default is the original fixed height", () => {
    expect(DEFAULT_PANEL_H).toBe(288);
  });

  test("the panel may take 70% of a tall window, but never less than the minimum", () => {
    expect(maxPanelHeight(1000)).toBe(700);
    expect(maxPanelHeight(50)).toBe(MIN_PANEL_H);
  });

  test("a height is rounded and kept between the limits", () => {
    expect(clampPanelHeight(300.4, 1000)).toBe(300);
    expect(clampPanelHeight(20, 1000)).toBe(MIN_PANEL_H);
    expect(clampPanelHeight(5000, 1000)).toBe(700);
  });
});

describe("fitPanelHeight", () => {
  test("is the chrome around the scrolling part plus all of its content", () => {
    // a 300px panel whose scrolling part shows 240px of 500px of content: 60px of tabs and headings
    expect(fitPanelHeight(300, 240, 500, 1200)).toBe(560);
  });

  test("shrinks to the content when the panel is taller than it needs", () => {
    expect(fitPanelHeight(400, 340, 120, 1200)).toBe(180);
  });

  test("never goes beyond what the window allows or below the minimum", () => {
    expect(fitPanelHeight(300, 240, 5000, 1000)).toBe(700);
    expect(fitPanelHeight(300, 280, 10, 1000)).toBe(MIN_PANEL_H);
  });

  test("gives nothing when there is nothing to measure", () => {
    expect(fitPanelHeight(0, 0, 0, 1000)).toBeNull();
    expect(fitPanelHeight(300, Number.NaN, 400, 1000)).toBeNull();
  });
});
