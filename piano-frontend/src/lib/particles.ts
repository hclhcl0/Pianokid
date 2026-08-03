export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  radius: number;
  color: string;
  alpha: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  emitHit(x: number, y: number, result: 'perfect' | 'good'): void {
    const isPerfect = result === 'perfect';
    const count = isPerfect ? 20 : 10;
    const colors = isPerfect 
      ? ['#FFD700', '#FFA500', '#FFFF00'] 
      : ['#00FFFF', '#667eea'];

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 10,
        vy: -Math.random() * 6 - 2,
        life: 1.0,
        decay: Math.random() * 0.02 + 0.02,
        radius: Math.random() * 4 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
      });
    }
  }

  emitMiss(x: number, y: number): void {
    const colors = ['#FF4444', '#888888'];
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 2 + 1,
        life: 1.0,
        decay: 0.05,
        radius: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
      });
    }
  }

  emitVictory(canvasWidth: number, canvasHeight: number): void {
    const colors = ['#FFD700', '#FF69B4', '#00FFFF', '#32CD32', '#FF4500'];
    for (let i = 0; i < 100; i++) {
      this.particles.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight * 0.5,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6 - 2,
        life: 1.0,
        decay: Math.random() * 0.005 + 0.005,
        radius: Math.random() * 5 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
      });
    }
  }

  update(): void {
    this.particles = this.particles.filter(p => p.life > 0);
    
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2; // gravity
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = p.color;
      this.ctx.fill();
      this.ctx.restore();
    }
  }
}
