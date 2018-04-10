module.exports = {
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },
  testRegex: "src(/.*)?/__tests__/[^/]*\\.(jsx?|tsx?)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.{ts?(x),js?(x)}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**/*.*"
  ]
}
