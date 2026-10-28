module.exports = {
  ...require("./jest.config"),
  collectCoverage: true,
  collectCoverageFrom: ["libs/modules/**/*.ts"],
  coverageDirectory: "coverage/unit-business",
  coverageReporters: ["json-summary", "text-summary", "lcov"],
  coverageThreshold: { global: { lines: 60 } },
};
