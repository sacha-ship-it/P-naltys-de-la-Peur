'use strict';

const { DatabaseSync } = require('node:sqlite');
const { randomUUID, randomInt } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class GameError extends Error {}

const fail = code => {
  throw new GameError(code);
};

const dayInParis = (now = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now));

function validDate(s) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}

function createEvent(title, start, end) {
  if (!validDate(start) || !validDate(end) || start > end) {
    fail('dates');
  }

  return {
    id: randomUUID().slice(0, 8),
    title: title.slice(0, 100),
    start,
    end,
    games: {},
    boards: [],
    panels: [],
  };
}

class Store {
  constructor(dir, defaults) {
    fs.mkdirSync(dir, {
      recursive: true,
      mode: 0o700,
    });

    this.file = path.join(dir, 'penalties.sqlite');
    this.db = new DatabaseSync(this.file);

    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      PRAGMA busy_timeout=5000;

      CREATE TABLE IF NOT EXISTS state (
        id INTEGER PRIMARY KEY CHECK(id=1),
        json TEXT NOT NULL
      );
    `);

    if (!this.db.prepare('SELECT id FROM state WHERE id=1').get()) {
      const event = createEvent(
        defaults.title,
        defaults.start,
        defaults.end
      );

      this.db
        .prepare('INSERT INTO state VALUES(1,?)')
        .run(
          JSON.stringify({
            current: event.id,
            events: {
              [event.id]: event,
            },
          })
        );
    }
  }

  read() {
    return JSON.parse(
      this.db.prepare('SELECT json FROM state WHERE id=1').get().json
    );
  }

  event() {
    const state = this.read();
    return state.events[state.current];
  }

  change(fn) {
    this.db.exec('BEGIN IMMEDIATE');

    try {
      const state = this.read();
      const result = fn(state, state.events[state.current]);

      this.db
        .prepare('UPDATE state SET json=? WHERE id=1')
        .run(JSON.stringify(state));

      this.db.exec('COMMIT');

      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.db.close();
  }
}

class Engine {
  constructor(
    store,
    {
      now = () => Date.now(),
      random = () => randomInt(3),
      timeout = 180000,
    } = {}
  ) {
    this.store = store;
    this.now = now;
    this.random = random;
    this.timeout = timeout;
  }

  active(event) {
    const day = dayInParis(this.now());

    if (day < event.start) fail('notStarted');
    if (day > event.end) fail('ended');

    return day;
  }

  game(event, id) {
    const game = event.games[id];

    if (!game) fail('missing');

    return game;
  }

  touch(game) {
    game.expires = this.now() + this.timeout;
  }

  solo(user, name, training = false) {
    return this.store.change((state, event) => {
      const day = this.active(event);

      let game = Object.values(event.games).find(
        game =>
          game.type === (training ? 'training' : 'solo') &&
          game.users[0] === user &&
          game.day === day &&
          (!training || game.phase !== 'finished')
      );

      if (game) return game;

      game = {
        id: randomUUID().slice(0, 12),
        event: event.id,
        type: training ? 'training' : 'solo',
        users: [user],
        names: [name.slice(0, 80)],
        day,
        phase: 'waiting',
        shots: [],
        keeperPlan: Array.from(
          { length: 5 },
          () => this.random()
        ),
        created: this.now(),
        finishedAt: null,
      };

      event.games[game.id] = game;

      return game;
    });
  }

  shoot(id, user, turn, direction) {
    return this.store.change((state, event) => {
      this.active(event);

      const game = this.game(event, id);

      if (game.type === 'duel') fail('invalid');
      if (game.users[0] !== user) fail('owner');

      if (game.day !== dayInParis(this.now())) {
        fail('oldDay');
      }

      if (
        game.phase !== 'waiting' ||
        turn !== game.shots.length
      ) {
        fail('stale');
      }

      if (![0, 1, 2].includes(direction)) {
        fail('invalid');
      }

      game.shots.push({
        shot: direction,
        dive: game.keeperPlan[turn],
        goal: direction !== game.keeperPlan[turn],
      });

      game.phase =
        game.shots.length === 5 ? 'finished' : 'result';

      if (game.phase === 'finished') {
        game.finishedAt = this.now();
      }

      return game;
    });
  }

  next(id, user, turn) {
    return this.store.change((state, event) => {
      this.active(event);

      const game = this.game(event, id);

      if (!game.users.includes(user)) {
        fail('owner');
      }

      if (
        game.type !== 'duel' &&
        game.day !== dayInParis(this.now())
      ) {
        fail('oldDay');
      }

      if (
        game.phase !== 'result' ||
        game.shots.length !== turn
      ) {
        fail('stale');
      }

      if (
        game.type === 'duel' &&
        game.expires < this.now()
      ) {
        fail('expired');
      }

      game.phase = 'waiting';

      if (game.type === 'duel') {
        this.touch(game);
      }

      return game;
    });
  }

  challenge(user, name, target, targetName, channel, lang) {
    return this.store.change((state, event) => {
      this.active(event);

      if (user === target) {
        fail('self');
      }

      const now = this.now();

      if (
        Object.values(event.games).some(
          game =>
            game.type === 'duel' &&
            game.users[0] === user &&
            now - game.created < 30000
        )
      ) {
        fail('cooldown');
      }

      if (
        Object.values(event.games).some(
          game =>
            game.type === 'duel' &&
            ['invited', 'waiting', 'result'].includes(
              game.phase
            ) &&
            game.expires > now &&
            game.users.some(id =>
              [user, target].includes(id)
            )
        )
      ) {
        fail('busy');
      }

      const game = {
        id: randomUUID().slice(0, 12),
        event: event.id,
        type: 'duel',
        users: [user, target],
        names: [
          name.slice(0, 80),
          targetName.slice(0, 80),
        ],
        day: dayInParis(now),
        phase: 'invited',
        shots: [],
        pending: {},
        created: now,
        channel,
        message: null,
        lang,
        finishedAt: null,
        expires: now + this.timeout,
      };

      event.games[game.id] = game;

      return game;
    });
  }

  accept(id, user) {
    return this.store.change((state, event) => {
      this.active(event);

      const game = this.game(event, id);

      if (
        game.type !== 'duel' ||
        game.users[1] !== user
      ) {
        fail('owner');
      }

      if (game.phase !== 'invited') {
        fail('stale');
      }

      if (game.expires < this.now()) {
        fail('expired');
      }

      game.phase = 'waiting';
      this.touch(game);

      return game;
    });
  }

  choose(id, user, turn, role, direction) {
    return this.store.change((state, event) => {
      this.active(event);

      const game = this.game(event, id);

      if (
        game.type !== 'duel' ||
        game.phase !== 'waiting' ||
        turn !== game.shots.length
      ) {
        fail('stale');
      }

      if (game.expires < this.now()) {
        fail('expired');
      }

      const shooter = turn % 2;

      const expected =
        role === 'shot'
          ? shooter
          : role === 'dive'
            ? 1 - shooter
            : -1;

      if (
        expected < 0 ||
        game.users[expected] !== user
      ) {
        fail('owner');
      }

      if (![0, 1, 2].includes(direction)) {
        fail('invalid');
      }

      if (game.pending[role] !== undefined) {
        fail('locked');
      }

      game.pending[role] = direction;

      if (
        game.pending.shot !== undefined &&
        game.pending.dive !== undefined
      ) {
        game.shots.push({
          shooter,
          ...game.pending,
          goal:
            game.pending.shot !== game.pending.dive,
        });

        game.pending = {};

        game.phase =
          game.shots.length === 10
            ? 'finished'
            : 'result';

        if (game.phase === 'finished') {
          game.finishedAt = this.now();
        } else {
          this.touch(game);
        }
      }

      return game;
    });
  }

  end(id, user, staff = false) {
    return this.store.change((state, event) => {
      const game = this.game(event, id);

      if (
        game.type !== 'duel' ||
        (!staff && !game.users.includes(user))
      ) {
        fail('owner');
      }

      if (
        ['finished', 'cancelled', 'expired'].includes(
          game.phase
        )
      ) {
        fail('stale');
      }

      game.phase = 'cancelled';
      game.finishedAt = this.now();

      return game;
    });
  }

  expire() {
    return this.store.change((state, event) => {
      const changed = [];

      for (const game of Object.values(event.games)) {
        if (
          game.type === 'duel' &&
          ['invited', 'waiting', 'result'].includes(
            game.phase
          ) &&
          (
            game.expires <= this.now() ||
            dayInParis(this.now()) > event.end
          )
        ) {
          game.phase = 'expired';
          game.finishedAt = this.now();
          changed.push(game);
        }
      }

      return changed;
    });
  }

  rankings(event = this.store.event()) {
    const users = new Map();

    for (const game of Object.values(event.games)) {
      if (
        game.type !== 'solo' ||
        game.phase !== 'finished'
      ) {
        continue;
      }

      const [id] = game.users;
      const points = game.shots.filter(
        shot => shot.goal
      ).length;

      const user = users.get(id) || {
        id,
        name: game.names[0],
        points: 0,
        days: 0,
        best: 0,
      };

      user.points += points;
      user.days++;
      user.best = Math.max(user.best, points);
      user.name = game.names[0];

      users.set(id, user);
    }

    const rows = [...users.values()].sort(
      (a, b) =>
        b.points - a.points ||
        a.id.localeCompare(b.id)
    );

    rows.forEach((user, index) => {
      user.rank =
        index &&
        rows[index - 1].points === user.points
          ? rows[index - 1].rank
          : index + 1;
    });

    return rows;
  }
}

module.exports = {
  Store,
  Engine,
  GameError,
  dayInParis,
  validDate,
  createEvent,
};
