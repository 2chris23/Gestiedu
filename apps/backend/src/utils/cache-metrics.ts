/**
 * CACHE METRICS COLLECTOR
 * 
 * Recolecta métricas sobre el uso del cache para monitoreo y optimización.
 * Métricas incluyen: hits, misses, invalidations, hit rate.
 */

interface CacheMetrics {
    hits: number;
    misses: number;
    invalidations: number;
    hitRate: number;
    totalRequests: number;
}

class CacheMetricsCollector {
    private hits = 0;
    private misses = 0;
    private invalidations = 0;
    private startTime = Date.now();

    /**
     * Incrementa contador de cache hits
     */
    incrementHits(): void {
        this.hits++;
    }

    /**
     * Incrementa contador de cache misses
     */
    incrementMisses(): void {
        this.misses++;
    }

    /**
     * Incrementa contador de invalidaciones
     */
    incrementInvalidations(): void {
        this.invalidations++;
    }

    /**
     * Obtiene métricas actuales
     */
    getMetrics(): CacheMetrics {
        const totalRequests = this.hits + this.misses;
        const hitRate = totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0;

        return {
            hits: this.hits,
            misses: this.misses,
            invalidations: this.invalidations,
            hitRate: Math.round(hitRate * 100) / 100, // 2 decimales
            totalRequests,
        };
    }

    /**
     * Obtiene métricas con información adicional
     */
    getDetailedMetrics() {
        const metrics = this.getMetrics();
        const uptime = Date.now() - this.startTime;
        const uptimeMinutes = Math.floor(uptime / 60000);

        return {
            ...metrics,
            uptime: {
                milliseconds: uptime,
                minutes: uptimeMinutes,
                hours: Math.floor(uptimeMinutes / 60),
            },
            requestsPerMinute: uptimeMinutes > 0
                ? Math.round((metrics.totalRequests / uptimeMinutes) * 100) / 100
                : 0,
        };
    }

    /**
     * Resetea todos los contadores
     */
    reset(): void {
        this.hits = 0;
        this.misses = 0;
        this.invalidations = 0;
        this.startTime = Date.now();
    }

    /**
     * Obtiene métricas y resetea (útil para reportes periódicos)
     */
    getAndReset(): CacheMetrics {
        const metrics = this.getMetrics();
        this.reset();
        return metrics;
    }
}

// Singleton instance
export const cacheMetrics = new CacheMetricsCollector();
