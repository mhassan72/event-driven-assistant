module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
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
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/test/shared/orchestration/'
  ],
  // Deployment test configuration
  projects: [
    {
      displayName: 'unit-tests',
      testMatch: ['<rootDir>/test/**/*.test.ts'],
      testPathIgnorePatterns: [
        '/node_modules/',
        '/test/shared/orchestration/',
        '/test/deployment/'
      ]
    },
    {
      displayName: 'deployment-tests',
      testMatch: ['<rootDir>/test/deployment/**/*.test.ts'],
      testTimeout: 300000, // 5 minutes for deployment tests
      setupFilesAfterEnv: ['<rootDir>/test/setup.ts']
    }
  ]
};