module.exports = {
  ...require("./jest.config"),
  testPathIgnorePatterns: ["/node_modules/"],
  testRegex: ".*\\.integration\\.spec\\.ts$",
  testTimeout: 30000,
};
