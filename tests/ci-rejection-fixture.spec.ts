describe("Required CI rejection evidence", () => {
  it("deliberately fails to demonstrate that a failing test blocks merge", () => {
    expect("intentional failing fixture; never merge").toBe("PASS");
  });
});
