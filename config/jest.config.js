module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: [
    '<rootDir>/test/**/*.test.ts',
    '<rootDir>/test/**/*.test.js'
  ],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: './config/tsconfig.test.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@api/(.*)$': '<rootDir>/src/api/$1'
  },
  forceExit: true,
  detectOpenHandles: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test/shared/orchestration/'
  ],
  // ES modules support
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  transformIgnorePatterns: [
    'node_modules/(?!(firebase-admin|firebase-functions)/)'
  ]
};