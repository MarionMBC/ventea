/**
 * Límite de intentos por clave en una ventana deslizante, en memoria (lógica pura con
 * reloj inyectable). Por proceso: con una sola réplica de la API alcanza; con varias,
 * cada una cuenta lo suyo y el límite efectivo se multiplica (pasar a Redis entonces).
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(private readonly windowMs: number) {}

  /**
   * Registra un intento. Devuelve `null` si entra en el límite, o los milisegundos hasta
   * que se libere un lugar si no entra (el intento rechazado no cuenta).
   */
  hit(key: string, limit: number, now: number): number | null {
    this.sweep(now);
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > since);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return recent[0]! + this.windowMs - now;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return null;
  }

  /** Borra las claves sin intentos en la ventana, como mucho una vez por ventana. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const since = now - this.windowMs;
    for (const [key, times] of this.hits) {
      if (!times.some((at) => at > since)) this.hits.delete(key);
    }
  }
}
