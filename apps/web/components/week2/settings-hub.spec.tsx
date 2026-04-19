import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsHub } from "./settings-hub";

describe("settings hub", () => {
  it("renders the screenshot-backed accounting settings launcher", () => {
    render(<SettingsHub orgSlug="nomad-events" />);

    expect(screen.getByText("Accounting Settings")).toBeTruthy();
    expect(screen.getByText("Tax Rates")).toBeTruthy();
    expect(screen.getByText("Team & Access")).toBeTruthy();
    expect(screen.getByText("Organisation Tax Details")).toBeTruthy();
    expect(screen.getByText("Connector Settings")).toBeTruthy();
    expect(screen.getAllByText("Open settings").length).toBeGreaterThanOrEqual(3);
  });
});
