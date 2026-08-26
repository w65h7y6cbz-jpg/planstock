/**
 * Enveloppe autour de D1.
 *
 * D1 est asynchrone là où SQLite en local était synchrone, et n'a pas de
 * transaction interactive : on ne peut pas lire au milieu d'une écriture. Ce
 * qui existe est `batch()`, qui exécute une suite d'instructions préparées
 * d'un bloc, tout ou rien.
 *
 * D'où la règle suivie dans tout le code : quand plusieurs écritures doivent
 * tenir ensemble, on les compose en un seul `batch`, et l'identifiant d'une
 * ligne tout juste insérée se retrouve par sous-requête sur une colonne unique
 * plutôt que par un aller-retour intermédiaire.
 */

export class Db {
  constructor(d1) {
    this.d1 = d1;
  }

  /** Instruction préparée, à passer à `batch`. */
  stmt(sql, ...params) {
    const prepared = this.d1.prepare(sql);
    return params.length > 0 ? prepared.bind(...params) : prepared;
  }

  /** Première ligne, ou `undefined` — même sémantique que l'ancien `.get()`. */
  async get(sql, ...params) {
    return (await this.stmt(sql, ...params).first()) ?? undefined;
  }

  /** Toutes les lignes. */
  async all(sql, ...params) {
    const { results } = await this.stmt(sql, ...params).all();
    return results ?? [];
  }

  /** Écriture unique. Renvoie l'identifiant inséré et le nombre de lignes touchées. */
  async run(sql, ...params) {
    const { meta } = await this.stmt(sql, ...params).run();
    return { lastInsertRowid: meta?.last_row_id ?? null, changes: meta?.changes ?? 0 };
  }

  /** Suite d'écritures atomique : tout passe, ou rien. */
  async batch(statements) {
    const kept = statements.filter(Boolean);
    if (kept.length === 0) return [];
    return this.d1.batch(kept);
  }
}
