/**
 * ReactiveState.ts
 * Implements a recursive Proxy for state reactivity with microtask-based debouncing.
 */

type Listener = (value: any) => void;

/**
 * Checks if a value is a plain object that should be proxied.
 * Avoids proxying Three.js instances, Arrays, and other class instances.
 */
function isPlainObject(value: any): boolean {
    if (typeof value !== 'object' || value === null) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/**
 * Creates a reactive state object using Proxies.
 * @param initialState The initial state object.
 * @returns A proxied state object with a .subscribe(path, callback) method.
 */
export function createReactiveState<T extends object>(initialState: T): T & { subscribe: (path: string, cb: Listener) => void } {
    const listeners = new Map<string, Set<Listener>>();
    const changedPaths = new Set<string>();
    let isQueued = false;

    // Map to store the actual values to avoid infinite recursion or proxy issues during notification
    const proxyMap = new WeakMap<object, any>();

    const notify = () => {
        isQueued = false;
        const pathsToNotify = Array.from(changedPaths);
        changedPaths.clear();

        pathsToNotify.forEach(path => {
            const pathListeners = listeners.get(path);
            if (pathListeners) {
                const value = getDeepValue(proxy, path);
                pathListeners.forEach(cb => {
                    try {
                        cb(value);
                    } catch (e) {
                        console.error(`Error in ReactiveState listener for path "${path}":`, e);
                    }
                });
            }
        });
    };

    const queueNotify = (path: string) => {
        changedPaths.add(path);
        if (!isQueued) {
            isQueued = true;
            queueMicrotask(notify);
        }
    };

    const getDeepValue = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    const createProxy = (obj: any, path: string = ''): any => {
        if (proxyMap.has(obj)) return proxyMap.get(obj);

        const handler: ProxyHandler<any> = {
            get(target, prop, receiver) {
                // Special case for subscribe method at the root
                if (prop === 'subscribe' && path === '') {
                    return (subscribePath: string, cb: Listener) => {
                        if (!listeners.has(subscribePath)) {
                            listeners.set(subscribePath, new Set());
                        }
                        listeners.get(subscribePath)!.add(cb);
                    };
                }

                const value = Reflect.get(target, prop, receiver);
                if (isPlainObject(value)) {
                    return createProxy(value, path ? `${path}.${String(prop)}` : String(prop));
                }
                return value;
            },
            set(target, prop, value, receiver) {
                const propName = String(prop);
                const fullPath = path ? `${path}.${propName}` : propName;
                const oldValue = Reflect.get(target, prop, receiver);
                
                // Only trigger if value actually changed
                if (oldValue === value) return true;

                const result = Reflect.set(target, prop, value, receiver);

                if (result) {
                    queueNotify(fullPath);
                    
                    // Also notify parent paths
                    let parentPath = path;
                    while (parentPath) {
                        queueNotify(parentPath);
                        const lastDot = parentPath.lastIndexOf('.');
                        parentPath = lastDot !== -1 ? parentPath.substring(0, lastDot) : '';
                    }
                }
                return result;
            }
        };

        const proxy = new Proxy(obj, handler);
        proxyMap.set(obj, proxy);
        return proxy;
    };

    const proxy = createProxy(initialState);
    return proxy;
}
