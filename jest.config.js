module.exports = {
  transform: {
    "^.+\\.ts$": "ts-jest"
  },
  testRegex: "src(/.*)?/__tests__/[^/]*\\.test\\.(ts)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.{ts?(x),js?(x)}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**/*.*"
  ]
}
