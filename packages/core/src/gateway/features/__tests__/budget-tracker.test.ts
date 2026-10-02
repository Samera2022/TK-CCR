/**
 * Budget Tracker Tests
 * TODO: Add to test suite when Jest is configured
 */

import { BudgetTracker } from '../budget-tracker'

describe('BudgetTracker', () => {
  let tracker: BudgetTracker

  beforeEach(() => {
    tracker = new BudgetTracker({
      defaultBudget: 100000,
      warningThreshold: 0.8,
      models: {
        'test-model': { budget: 50000 }
      }
    })
  })

  it('should record usage correctly', () => {
    tracker.recordUsage('session1', 'test-model', 1000, 500)
    
    const state = tracker.getBudgetState('session1', 'test-model')
    expect(state).toBeDefined()
    expect(state!.used).toBe(1500)
    expect(state!.remaining).toBe(48500)
  })

  it('should detect over budget', () => {
    tracker.recordUsage('session1', 'test-model', 60000, 0)
    
    expect(tracker.isOverBudget('session1', 'test-model')).toBe(true)
  })
})
