// @vitest-environment happy-dom
import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import AvatarPreview from "@/components/avatar-preview";
afterEach(cleanup);

it("uses a shipped static head image, without a live canvas", () => {
  const { container } = render(<AvatarPreview model="a" headOnly />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/avatars/character-a-head.png");
  expect(container.querySelector("canvas")).toBeNull();
  expect(container.querySelector(".avatar-head-only")).toBeTruthy();
});

it("updates immediately when the chosen avatar changes", () => {
  const view = render(<AvatarPreview model="a" headOnly />);
  view.rerender(<AvatarPreview model="r" headOnly />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/avatars/character-r-head.png");
});

it("falls back safely after image failure and tries a newly chosen avatar", () => {
  const view = render(<AvatarPreview model="unknown" headOnly />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/avatars/character-r-head.png");
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector(".avatar-thumbnail-placeholder")).toBeTruthy();
  view.rerender(<AvatarPreview model="c" headOnly />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/avatars/character-c-head.png");
});

it("uses a separate full-body asset for character selectors", () => {
  const { container } = render(<AvatarPreview model="f" />);
  expect(container.querySelector("img")?.getAttribute("src")).toBe("/avatars/character-f-body.png");
  expect(container.querySelector(".avatar-head-only")).toBeNull();
});
