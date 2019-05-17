module.exports = {
  transform: {
    "^.+\\.ts$": "ts-jest"
  },
  roots: ['src/'],
  testRegex: "src(/.*)?/__tests__/[^/]*\\.test\\.(ts)$",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.d.ts",
    "!src/**/__tests__/**/*.*",
    "!src/test/**/*.*"
  ],
  coverageReporters: [
    "text-summary",
    "lcov",
    "html"
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: -10
    }
  },

}
