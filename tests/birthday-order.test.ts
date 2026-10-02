import { describe, expect, it } from "vitest";
import { formatBirthday, orderBirthdays } from "@/lib/birthdays/order";

const people = [
  { userId: "past", name: "Ontem", avatar: "a", title: "", birthDayMonth: "09-30" },
  { userId: "later", name: "Depois", avatar: "c", title: "", birthDayMonth: "10-15" },
  { userId: "today", name: "Hoje", avatar: "f", title: "", birthDayMonth: "10-01" },
  { userId: "next", name: "Amanhã", avatar: "j", title: "", birthDayMonth: "10-02" },
];

describe("birthday directory", () => {
  it("starts with today and upcoming dates, leaving yesterday at the end", () => {
    expect(orderBirthdays(people, "10-01").map((person) => person.userId))
      .toEqual(["today", "next", "later", "past"]);
  });

  it("formats day and month without exposing a year", () => {
    expect(formatBirthday("10-05")).toBe("05 de outubro");
  });
});
