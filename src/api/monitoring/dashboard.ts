/**
 * Operational Dashboard API
 * Provides endpoints for system health and business metrics dashboards
 */

import { Request, Response } from 'express';
import { healthChecker } from '../../shared/observability/health-checker';
import { performanceMonitor } from '../../shared/observability/performance-monitor';
import { alertingSystem } from '../../shared/observability/alerting-system';
import { productionLogger } from '../../shared/observability/production-logger';
import * as admin from 'firebase-admin';

export class DashboardController {
  /**
   * Get system health overview
   */
  public async getSystemHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await healthChecker.runAllHealthChecks();
      
      res.json({
        success: true,
        data: health,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      productionLogger.error('Failed to get system health', {
        component: 'dashboard',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system health'
      });
    }
  }

  /**
   * Get performance metrics
   */
  public async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const minutes = parseInt(req.query.minutes as string) || 60;
      
      const metrics = {
        apiResponseTime: performanceMonitor.getMetricSummary('api_response_time', minutes),
        creditOperationTime: performanceMonitor.getMetricSummary('credit_operation_time', minutes),
        aiResponseTime: performanceMonitor.getMetricSummary('ai_response_time', minutes),
        paymentProcessingTime: performanceMonitor.getMetricSummary('payment_processing_time', minutes),
        systemHealth: performanceMonitor.getSystemHealth()
      };

      res.json({
        success: true,
        data: metrics,
        timeWindow: `${minutes} minutes`,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      productionLogger.error('Failed to get performance metrics', {
        component: 'dashboard',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve performance metrics'
      });
    }
  }

  /**
   * Get active alerts
   */
  public async getActiveAlerts(req: Request, res: Response): Promise<void> {
    try {
      const activeAlerts = alertingSystem.getActiveAlerts();
      const alertHistory = alertingSystem.getAlertHistory(24); // Last 24 hours
      
      res.json({
        success: true,
        data: {
          active: activeAlerts,
          recent: alertHistory,
          summary: {
            activeCount: activeAlerts.length,
            recentCount: alertHistory.length,
            criticalCount: activeAlerts.filter(a => a.type === 'critical').length,
            warningCount: activeAlerts.filter(a => a.type === 'warning').length
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      productionLogger.error('Failed to get alerts', {
        component: 'dashboard',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve alerts'
      });
    }
  }

  /**
   * Get business metrics
   */
  public async getBusinessMetrics(req: Request, res: Response): Promise<void> {
    try {
      const hours = parseInt(req.query.hours as string) || 24;
      const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      
      // Get metrics from Firestore
      const db = admin.firestore();
      
      // User metrics
      const usersSnapshot = await db.collection('users')
        .where('createdAt', '>=', startTime)
        .get();
      
      // Credit transactions
      const creditTransactionsSnapshot = await db.collection('credit_transactions')
        .where('timestamp', '>=', startTime)
        .get();
      
      // AI interactions
      const aiInteractionsSnapshot = await db.collection('ai_interactions')
        .where('timestamp', '>=', startTime)
        .get();
      
      // Payments
      const paymentsSnapshot = await db.collection('payments')
        .where('timestamp', '>=', startTime)
        .get();

      // Calculate metrics
      const newUsers = usersSnapshot.size;
      const totalCreditTransactions = creditTransactionsSnapshot.size;
      const totalAIInteractions = aiInteractionsSnapshot.size;
      const totalPayments = paymentsSnapshot.size;
      
      // Calculate credit usage
      let totalCreditsUsed = 0;
      let totalCreditsAdded = 0;
      creditTransactionsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.type === 'DEDUCTION') {
          totalCreditsUsed += data.amount;
        } else if (['ADDITION', 'PURCHASE', 'WELCOME_BONUS'].includes(data.type)) {
          totalCreditsAdded += data.amount;
        }
      });
      
      // Calculate revenue
      let totalRevenue = 0;
      paymentsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'completed') {
          totalRevenue += data.amount;
        }
      });
      
      // AI model usage
      const modelUsage: Record<string, number> = {};
      aiInteractionsSnapshot.forEach(doc => {
        const data = doc.data();
        const model = data.model || 'unknown';
        modelUsage[model] = (modelUsage[model] || 0) + 1;
      });

      const businessMetrics = {
        users: {
          new: newUsers,
          total: await this.getTotalUserCount()
        },
        credits: {
          used: totalCreditsUsed,
          added: totalCreditsAdded,
          net: totalCreditsAdded - totalCreditsUsed,
          transactions: totalCreditTransactions
        },
        ai: {
          interactions: totalAIInteractions,
          modelUsage,
          averageCreditsPerInteraction: totalAIInteractions > 0 ? totalCreditsUsed / totalAIInteractions : 0
        },
        payments: {
          count: totalPayments,
          revenue: totalRevenue,
          averageAmount: totalPayments > 0 ? totalRevenue / totalPayments : 0
        },
        timeWindow: `${hours} hours`
      };

      res.json({
        success: true,
        data: businessMetrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      productionLogger.error('Failed to get business metrics', {
        component: 'dashboard',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve business metrics'
      });
    }
  }

  /**
   * Get system overview for main dashboard
   */
  public async getSystemOverview(req: Request, res: Response): Promise<void> {
    try {
      const [health, alerts, businessMetrics] = await Promise.all([
        healthChecker.getSystemHealth(),
        alertingSystem.getActiveAlerts(),
        this.getQuickBusinessMetrics()
      ]);

      const overview = {
        system: {
          status: health.overall,
          uptime: health.uptime,
          lastCheck: health.timestamp,
          componentsHealthy: health.summary.healthy,
          componentsTotal: health.summary.total
        },
        alerts: {
          active: alerts.length,
          critical: alerts.filter(a => a.type === 'critical').length,
          warnings: alerts.filter(a => a.type === 'warning').length
        },
        business: businessMetrics,
        performance: performanceMonitor.getSystemHealth()
      };

      res.json({
        success: true,
        data: overview,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      productionLogger.error('Failed to get system overview', {
        component: 'dashboard',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve system overview'
      });
    }
  }

  private async getTotalUserCount(): Promise<number> {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection('users').count().get();
      return snapshot.data().count;
    } catch (error) {
      productionLogger.warn('Failed to get total user count', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return 0;
    }
  }

  private async getQuickBusinessMetrics(): Promise<any> {
    try {
      const db = admin.firestore();
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [creditTxns, aiInteractions, payments] = await Promise.all([
        db.collection('credit_transactions').where('timestamp', '>=', last24Hours).count().get(),
        db.collection('ai_interactions').where('timestamp', '>=', last24Hours).count().get(),
        db.collection('payments').where('timestamp', '>=', last24Hours).count().get()
      ]);

      return {
        creditTransactions24h: creditTxns.data().count,
        aiInteractions24h: aiInteractions.data().count,
        payments24h: payments.data().count
      };
    } catch (error) {
      productionLogger.warn('Failed to get quick business metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return {
        creditTransactions24h: 0,
        aiInteractions24h: 0,
        payments24h: 0
      };
    }
  }
}