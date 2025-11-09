/**
 * Component Registry
 * Dynamic, configurable component system for easy extension
 * Implements Registry, Plugin, and Dependency Injection patterns
 */

import { IStructuredLogger } from '../observability/logger';

/**
 * Component lifecycle states
 */
export enum ComponentState {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  INITIALIZED = 'initialized',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

/**
 * Component metadata
 */
export interface ComponentMetadata {
  name: string;
  version: string;
  description: string;
  dependencies: string[];
  optional: boolean;
  priority: number; // Higher priority components initialize first
}

/**
 * Component interface
 * All components must implement this interface
 */
export interface IComponent {
  /**
   * Get component metadata
   */
  getMetadata(): ComponentMetadata;

  /**
   * Initialize component
   */
  initialize(): Promise<void>;

  /**
   * Start component
   */
  start(): Promise<void>;

  /**
   * Stop component
   */
  stop(): Promise<void>;

  /**
   * Get component state
   */
  getState(): ComponentState;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Abstract base component
 * Provides common functionality for all components
 */
export abstract class BaseComponent implements IComponent {
  protected state: ComponentState = ComponentState.UNINITIALIZED;
  protected logger: IStructuredLogger;
  protected abstract metadata: ComponentMetadata;

  constructor(logger: IStructuredLogger) {
    this.logger = logger;
  }

  public getMetadata(): ComponentMetadata {
    return { ...this.metadata };
  }

  public getState(): ComponentState {
    return this.state;
  }

  public async initialize(): Promise<void> {
    if (this.state !== ComponentState.UNINITIALIZED) {
      throw new Error(`Cannot initialize component in state: ${this.state}`);
    }

    this.state = ComponentState.INITIALIZING;
    
    try {
      this.logger.info('Initializing component', {
        component: this.metadata.name,
        version: this.metadata.version
      });

      await this.onInitialize();
      
      this.state = ComponentState.INITIALIZED;
      
      this.logger.info('Component initialized', {
        component: this.metadata.name
      });
    } catch (error) {
      this.state = ComponentState.ERROR;
      this.logger.error('Component initialization failed', {
        component: this.metadata.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async start(): Promise<void> {
    if (this.state !== ComponentState.INITIALIZED && this.state !== ComponentState.STOPPED) {
      throw new Error(`Cannot start component in state: ${this.state}`);
    }

    this.state = ComponentState.STARTING;
    
    try {
      this.logger.info('Starting component', {
        component: this.metadata.name
      });

      await this.onStart();
      
      this.state = ComponentState.RUNNING;
      
      this.logger.info('Component started', {
        component: this.metadata.name
      });
    } catch (error) {
      this.state = ComponentState.ERROR;
      this.logger.error('Component start failed', {
        component: this.metadata.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.state !== ComponentState.RUNNING) {
      throw new Error(`Cannot stop component in state: ${this.state}`);
    }

    this.state = ComponentState.STOPPING;
    
    try {
      this.logger.info('Stopping component', {
        component: this.metadata.name
      });

      await this.onStop();
      
      this.state = ComponentState.STOPPED;
      
      this.logger.info('Component stopped', {
        component: this.metadata.name
      });
    } catch (error) {
      this.state = ComponentState.ERROR;
      this.logger.error('Component stop failed', {
        component: this.metadata.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      return await this.onHealthCheck();
    } catch (error) {
      this.logger.error('Health check failed', {
        component: this.metadata.name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Hook methods to be implemented by subclasses
   */
  protected abstract onInitialize(): Promise<void>;
  protected abstract onStart(): Promise<void>;
  protected abstract onStop(): Promise<void>;
  protected abstract onHealthCheck(): Promise<boolean>;
}

/**
 * Component registry
 * Manages component lifecycle and dependencies
 */
export class ComponentRegistry {
  private static instance: ComponentRegistry;
  private components: Map<string, IComponent> = new Map();
  private logger: IStructuredLogger;
  private initializationOrder: string[] = [];

  private constructor(logger: IStructuredLogger) {
    this.logger = logger;
  }

  public static getInstance(logger: IStructuredLogger): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry(logger);
    }
    return ComponentRegistry.instance;
  }

  /**
   * Register a component
   */
  public register(component: IComponent): void {
    const metadata = component.getMetadata();
    
    if (this.components.has(metadata.name)) {
      throw new Error(`Component already registered: ${metadata.name}`);
    }

    this.components.set(metadata.name, component);
    
    this.logger.info('Component registered', {
      name: metadata.name,
      version: metadata.version,
      dependencies: metadata.dependencies
    });
  }

  /**
   * Unregister a component
   */
  public unregister(name: string): void {
    const component = this.components.get(name);
    
    if (!component) {
      throw new Error(`Component not found: ${name}`);
    }

    if (component.getState() === ComponentState.RUNNING) {
      throw new Error(`Cannot unregister running component: ${name}`);
    }

    this.components.delete(name);
    
    this.logger.info('Component unregistered', { name });
  }

  /**
   * Get a component by name
   */
  public get(name: string): IComponent | undefined {
    return this.components.get(name);
  }

  /**
   * Check if component is registered
   */
  public has(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * Get all registered components
   */
  public getAll(): IComponent[] {
    return Array.from(this.components.values());
  }

  /**
   * Initialize all components in dependency order
   */
  public async initializeAll(): Promise<void> {
    this.logger.info('Initializing all components');

    // Calculate initialization order based on dependencies and priority
    this.initializationOrder = this.calculateInitializationOrder();

    // Initialize components in order
    for (const name of this.initializationOrder) {
      const component = this.components.get(name);
      
      if (!component) {
        continue;
      }

      const metadata = component.getMetadata();

      try {
        await component.initialize();
      } catch (error) {
        if (!metadata.optional) {
          throw new Error(`Failed to initialize required component: ${name}`);
        }
        
        this.logger.warn('Optional component initialization failed', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.logger.info('All components initialized');
  }

  /**
   * Start all components
   */
  public async startAll(): Promise<void> {
    this.logger.info('Starting all components');

    for (const name of this.initializationOrder) {
      const component = this.components.get(name);
      
      if (!component || component.getState() !== ComponentState.INITIALIZED) {
        continue;
      }

      const metadata = component.getMetadata();

      try {
        await component.start();
      } catch (error) {
        if (!metadata.optional) {
          throw new Error(`Failed to start required component: ${name}`);
        }
        
        this.logger.warn('Optional component start failed', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.logger.info('All components started');
  }

  /**
   * Stop all components in reverse order
   */
  public async stopAll(): Promise<void> {
    this.logger.info('Stopping all components');

    // Stop in reverse order
    for (let i = this.initializationOrder.length - 1; i >= 0; i--) {
      const name = this.initializationOrder[i];
      const component = this.components.get(name);
      
      if (!component || component.getState() !== ComponentState.RUNNING) {
        continue;
      }

      try {
        await component.stop();
      } catch (error) {
        this.logger.error('Component stop failed', {
          name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.logger.info('All components stopped');
  }

  /**
   * Health check all components
   */
  public async healthCheckAll(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, component] of this.components.entries()) {
      if (component.getState() === ComponentState.RUNNING) {
        results.set(name, await component.healthCheck());
      } else {
        results.set(name, false);
      }
    }

    return results;
  }

  /**
   * Calculate initialization order based on dependencies and priority
   */
  private calculateInitializationOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }

      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected: ${name}`);
      }

      visiting.add(name);

      const component = this.components.get(name);
      if (component) {
        const metadata = component.getMetadata();
        
        // Visit dependencies first
        for (const dep of metadata.dependencies) {
          if (this.components.has(dep)) {
            visit(dep);
          } else if (!metadata.optional) {
            throw new Error(`Missing required dependency: ${dep} for component: ${name}`);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    // Sort components by priority (higher priority first)
    const sortedComponents = Array.from(this.components.entries())
      .sort((a, b) => b[1].getMetadata().priority - a[1].getMetadata().priority);

    // Visit all components
    for (const [name] of sortedComponents) {
      visit(name);
    }

    return order;
  }

  /**
   * Get component statistics
   */
  public getStatistics(): {
    total: number;
    byState: Record<ComponentState, number>;
    healthy: number;
  } {
    const stats = {
      total: this.components.size,
      byState: {} as Record<ComponentState, number>,
      healthy: 0
    };

    // Initialize state counts
    for (const state of Object.values(ComponentState)) {
      stats.byState[state as ComponentState] = 0;
    }

    // Count components by state
    for (const component of this.components.values()) {
      const state = component.getState();
      stats.byState[state]++;
      
      if (state === ComponentState.RUNNING) {
        stats.healthy++;
      }
    }

    return stats;
  }
}

/**
 * Plugin interface for extending functionality
 */
export interface IPlugin {
  /**
   * Get plugin name
   */
  getName(): string;

  /**
   * Get plugin version
   */
  getVersion(): string;

  /**
   * Install plugin
   */
  install(registry: ComponentRegistry): Promise<void>;

  /**
   * Uninstall plugin
   */
  uninstall(registry: ComponentRegistry): Promise<void>;
}

/**
 * Plugin manager
 * Manages plugins and their lifecycle
 */
export class PluginManager {
  private plugins: Map<string, IPlugin> = new Map();
  private registry: ComponentRegistry;
  private logger: IStructuredLogger;

  constructor(registry: ComponentRegistry, logger: IStructuredLogger) {
    this.registry = registry;
    this.logger = logger;
  }

  /**
   * Install a plugin
   */
  public async install(plugin: IPlugin): Promise<void> {
    const name = plugin.getName();
    
    if (this.plugins.has(name)) {
      throw new Error(`Plugin already installed: ${name}`);
    }

    this.logger.info('Installing plugin', {
      name,
      version: plugin.getVersion()
    });

    try {
      await plugin.install(this.registry);
      this.plugins.set(name, plugin);
      
      this.logger.info('Plugin installed', { name });
    } catch (error) {
      this.logger.error('Plugin installation failed', {
        name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Uninstall a plugin
   */
  public async uninstall(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    
    if (!plugin) {
      throw new Error(`Plugin not found: ${name}`);
    }

    this.logger.info('Uninstalling plugin', { name });

    try {
      await plugin.uninstall(this.registry);
      this.plugins.delete(name);
      
      this.logger.info('Plugin uninstalled', { name });
    } catch (error) {
      this.logger.error('Plugin uninstallation failed', {
        name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get all installed plugins
   */
  public getInstalledPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }
}
