'use strict';

const path = require('node:path');
const { randomUUID } = require('node:crypto');

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
} = require('discord.js');

const {
  Store,
  Engine: BaseEngine,
  GameError,
  dayInParis,
  createEvent,
} = require('./engine');

const { arena } = require('./arena');

// Conserve les parties et les tentatives quotidiennes.
// Une remise à zéro exclut uniquement les séries déjà terminées.
class Engine extends BaseEngine {
  rankings(e = this.store.event()) {
    return super.rankings({
      ...e,
      games: Object.fromEntries(
        Object.entries(e.games).filter(([, g]) => !g.scoreExcluded)
      ),
    });
  }

  resetRankings(actor) {
    return this.store.change((s, e) => {
      const id = `reset-${randomUUID().slice(0, 12)}`;

      s.events[id] = {
        ...structuredClone(e),
        id,
        boards: [],
        panels: [],
        resetBy: actor,
        resetAt: Date.now(),
      };

      for (const g of Object.values(e.games)) {
        if (g.type === 'solo' && g.phase === 'finished') {
          g.scoreExcluded = true;
        }
      }

      return id;
    });
  }
}

const C = {
  red: 0xE52649,
  blue: 0x073B67,
  gold: 0xFFAF67,
  green: 0x5BE9BB,
};

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const clean = s =>
  String(s)
    .replace(/([\\`*_~|>])/g, '\\$1')
    .replace(/@/g, '@\u200b');

const displayDate = (d, lang) =>
  new Intl.DateTimeFormat(
    lang === 'en' ? 'en-GB' : 'fr-FR',
    {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }
  ).format(new Date(d));

const T = {
  fr: {
    daily: 'Mon défi du jour',
    training: 'Entraînement',
    duel: 'Défier un supporter',
    ranking: 'Classement',
    profile: 'Mes stats',
    rules: 'Les règles',

    left: 'Gauche',
    centre: 'Centre',
    right: 'Droite',
    next: 'Tir suivant',
    shoot: 'Choisir mon tir',
    dive: 'Choisir ma parade',
    accept: 'Accepter le duel',
    leave: 'Quitter',
    confirm: 'Oui, quitter',
    cancel: 'Continuer à jouer',

    intro:
      '**Cinq tirs. Un gardien fantôme. À toi de jouer.**\n\n' +
      'Reviens chaque jour tenter ta chance : **1 but = 1 point** au classement de l’événement.\n\n' +
      'Tu peux aussi t’entraîner ou défier un autre supporter. Les duels et l’entraînement se jouent pour le plaisir, sans points au classement.',

    rulesText:
      '**🎯 Le défi du jour**\n' +
      'Choisis gauche, centre ou droite. Le gardien choisit aussi son côté : s’il plonge du même côté, il arrête le ballon. Sinon, c’est but !\n\n' +
      '**🏅 Le classement**\n' +
      'Une série de 5 tirs par jour, avec 1 point par but. Termine ta série pour enregistrer les points. Tu peux la reprendre le même jour si tu la quittes. Le compteur quotidien change à minuit, heure de Paris.\n\n' +
      '**🤝 Les duels**\n' +
      '5 tirs chacun, en alternant tireur et gardien. Les choix restent secrets jusqu’à ce que les deux joueurs aient validé. Chaque choix est définitif. Les duels ne rapportent aucun point au classement.\n\n' +
      '**👟 L’entraînement**\n' +
      'Autant de séries que tu veux, sans points.\n\n' +
      'À égalité de points, les supporters partagent la même place. Les éventuelles dotations seront annoncées par le staff.',

    noScores:
      'Aucune série terminée pour le moment. À toi d’ouvrir le score !',

    soloHint:
      'Choisis ton côté. Le gardien a déjà fait son choix…',

    trainingHint:
      'Série libre : aucun point au classement.',

    goal: '⚽ **BUUUUT !**',
    save: '🧤 **Le gardien l’arrête !**',
    finished: '🏁 Série terminée',

    saved:
      'Tes points sont enregistrés. Reviens demain pour ta prochaine série !',

    practiceSaved:
      'Série d’entraînement terminée. Tu peux en relancer une depuis le menu.',

    lockedChoice:
      '🔒 Ton choix est enregistré et reste secret. Ton écran privé sera actualisé quand ton adversaire aura choisi.',

    pickOpponent:
      'Choisis le supporter que tu veux défier. Il recevra une invitation ici.',

    invitation:
      'Une séance de tirs au but entre supporters ? **5 tirs chacun**, sans points au classement.',

    invitationSent:
      'Le défi est envoyé dans ce salon. Ton adversaire doit l’accepter pour commencer.',

    wait:
      'Les choix restent secrets jusqu’à leur validation par les deux joueurs.',

    privateHint:
      'Choisis ton côté ci-dessous. **Ton choix sera définitif.**',

    exitQuestion:
      'Quitter ce duel ? Il sera fermé pour les deux joueurs, sans effet sur le classement.',

    closed:
      'Ce duel est terminé. Aucun point n’est attribué au classement.',

    expiredText:
      'Temps écoulé. Ce duel est fermé, sans effet sur le classement. Tu peux lancer un nouveau défi.',

    draw: '🤝 Égalité !',
    winner: '🏆 Victoire de',
    noRank: 'Pas encore classé',

    errors: {
      dates:
        'Utilise des dates valides au format AAAA-MM-JJ, dans le bon ordre.',
      notStarted:
        'L’événement n’a pas encore commencé.',
      ended:
        'L’événement est terminé.',
      missing:
        'Cette partie n’est plus disponible.',
      owner:
        'Ce bouton est réservé au joueur concerné.',
      oldDay:
        'Cette série appartient à une journée terminée. Relance ton défi du jour.',
      stale:
        'Cette étape est déjà terminée. Utilise le dernier écran de la partie ou reprends-la depuis le menu.',
      invalid:
        'Cette action n’est pas disponible.',
      self:
        'Choisis un autre supporter pour le duel.',
      busy:
        'Toi ou ton adversaire avez déjà un duel en cours. Termine-le ou attends son expiration.',
      expired:
        'Le délai du duel est dépassé.',
      locked:
        'Tu as déjà choisi. Ton choix reste secret jusqu’à la fin de ce tir.',
      oldEvent:
        'Ce menu appartient à un ancien événement. Utilise le nouveau menu.',
      staff:
        'Cette commande est réservée au staff.',
      bot:
        'Choisis un membre du serveur, pas un bot.',
      general:
        'Impossible de terminer cette action. Réessaie depuis le menu. Si cela continue, préviens le staff.',
    },
  },

  en: {
    daily: 'My daily challenge',
    training: 'Training',
    duel: 'Challenge a supporter',
    ranking: 'Leaderboard',
    profile: 'My stats',
    rules: 'The rules',

    left: 'Left',
    centre: 'Centre',
    right: 'Right',
    next: 'Next penalty',
    shoot: 'Choose my shot',
    dive: 'Choose my save',
    accept: 'Accept the duel',
    leave: 'Leave',
    confirm: 'Yes, leave',
    cancel: 'Keep playing',

    intro:
      '**Five penalties. One ghost goalkeeper. Your turn.**\n\n' +
      'Come back every day: **1 goal = 1 point** on the event leaderboard.\n\n' +
      'You can also practise or challenge another supporter. Duels and training are just for fun and do not award leaderboard points.',

    rulesText:
      '**🎯 The daily challenge**\n' +
      'Pick left, centre or right. The goalkeeper picks a side too: if it matches yours, the shot is saved. Otherwise, it’s a goal!\n\n' +
      '**🏅 The leaderboard**\n' +
      'One set of 5 penalties per day. Each goal earns 1 point. Finish your set to register your points. You can resume an unfinished set on the same day. Each new day starts at midnight, Paris time.\n\n' +
      '**🤝 Duels**\n' +
      '5 shots each, taking turns as shooter and goalkeeper. Choices stay secret until both players have submitted. Each choice is final. Duels do not award leaderboard points.\n\n' +
      '**👟 Training**\n' +
      'Play as many sets as you like, without points.\n\n' +
      'Supporters with equal points share the same rank. Any prizes will be announced by the staff.',

    noScores:
      'No completed sets yet. Be the first to score!',

    soloHint:
      'Pick your side. The goalkeeper has already made a choice…',

    trainingHint:
      'Practice session: no leaderboard points.',

    goal: '⚽ **GOOOAL!**',
    save: '🧤 **Saved by the keeper!**',
    finished: '🏁 Set completed',

    saved:
      'Your points are saved. Come back tomorrow for your next set!',

    practiceSaved:
      'Training complete. Start another set from the menu whenever you like.',

    lockedChoice:
      '🔒 Your choice is saved and stays secret. Your private game screen will update once your opponent has chosen.',

    pickOpponent:
      'Choose the supporter you want to challenge. Their invitation will appear here.',

    invitation:
      'A penalty shootout between supporters? **5 shots each**, with no leaderboard points.',

    invitationSent:
      'The challenge was posted in this channel. Your opponent needs to accept it to start.',

    wait:
      'Choices remain secret until both players have submitted.',

    privateHint:
      'Pick your side below. **Your choice will be final.**',

    exitQuestion:
      'Leave this duel? It will close for both players, with no effect on the leaderboard.',

    closed:
      'This duel is closed. No leaderboard points are awarded.',

    expiredText:
      'Time is up. This duel is closed, with no effect on the leaderboard. You can start a new challenge.',

    draw: '🤝 It’s a draw!',
    winner: '🏆 Winner:',
    noRank: 'Not ranked yet',

    errors: {
      dates:
        'Use valid YYYY-MM-DD dates in the right order.',
      notStarted:
        'The event has not started yet.',
      ended:
        'The event has ended.',
      missing:
        'This game is no longer available.',
      owner:
        'This button is only for the relevant player.',
      oldDay:
        'This set belongs to a previous day. Start your new daily challenge.',
      stale:
        'This step is already complete. Use the latest game screen or resume from the menu.',
      invalid:
        'This action is not available.',
      self:
        'Pick another supporter for your duel.',
      busy:
        'You or your opponent already have an active duel. Finish it or wait for it to expire.',
      expired:
        'The duel timed out.',
      locked:
        'You already chose. Your choice stays secret until the shot is resolved.',
      oldEvent:
        'This menu belongs to a previous event. Please use the new menu.',
      staff:
        'This command is for staff only.',
      bot:
        'Choose a server member, not a bot.',
      general:
        'This action could not be completed. Try again from the menu. If it keeps happening, contact the staff.',
    },
  },
};

const button = (
  id,
  label,
  style = ButtonStyle.Secondary,
  emoji
) => {
  const b = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style);

  if (emoji) b.setEmoji(emoji);

  return b;
};

const row = (...buttons) =>
  new ActionRowBuilder().addComponents(buttons);

const baseEmbed = () =>
  new EmbedBuilder()
    .setColor(C.red)
    .setFooter({ text: 'PARIS • Halloween' });

function panelPayload(e, lang, image) {
  const t = T[lang];

  const embed = baseEmbed()
    .setTitle(
      lang === 'en'
        ? 'PENALTIES OF FEAR 👻'
        : `${e.title} 👻`
    )
    .setDescription(t.intro)
    .addFields({
      name: '🗓️',
      value:
        `${displayDate(e.start, lang)} → ${displayDate(e.end, lang)}` +
        ` · ${lang === 'en' ? 'Paris time' : 'Heure de Paris'}`,
    });

  if (image) embed.setImage(image);

  return {
    embeds: [embed],
    components: [
      row(
        button(
          `p:${e.id}:daily:${lang}`,
          t.daily,
          ButtonStyle.Danger,
          '⚽'
        ),
        button(
          `p:${e.id}:training:${lang}`,
          t.training,
          ButtonStyle.Secondary,
          '👟'
        ),
        button(
          `p:${e.id}:duel:${lang}`,
          t.duel,
          ButtonStyle.Primary,
          '🤝'
        )
      ),
      row(
        button(
          `p:${e.id}:ranking:${lang}`,
          t.ranking,
          ButtonStyle.Secondary,
          '🏆'
        ),
        button(
          `p:${e.id}:profile:${lang}`,
          t.profile,
          ButtonStyle.Secondary,
          '📊'
        ),
        button(
          `p:${e.id}:rules:${lang}`,
          t.rules,
          ButtonStyle.Secondary,
          '📖'
        )
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

function directions(prefix, lang) {
  const t = T[lang];

  return row(
    button(
      `${prefix}:0:${lang}`,
      t.left,
      ButtonStyle.Primary,
      '↖️'
    ),
    button(
      `${prefix}:1:${lang}`,
      t.centre,
      ButtonStyle.Secondary,
      '⬆️'
    ),
    button(
      `${prefix}:2:${lang}`,
      t.right,
      ButtonStyle.Danger,
      '↗️'
    )
  );
}

function score(g, userIndex = 0) {
  return g.shots.filter(
    s =>
      (g.type !== 'duel' || s.shooter === userIndex) &&
      s.goal
  ).length;
}

async function gamePayload(g, lang, run = false) {
  const t = T[lang];
  const duel = g.type === 'duel';

  const fileName =
    `arena-${g.id}-${randomUUID().slice(0, 8)}.png`;

  const img = new AttachmentBuilder(
    await arena(g, lang, run ? 'run' : 'normal'),
    { name: fileName }
  );

  const embed = baseEmbed()
    .setImage(`attachment://${fileName}`);

  if (duel) {
    embed.setFooter({ text: `PARIS • Duel ${g.id}` });
  }

  let components = [];
  let text = '';

  if (duel) {
    embed.setTitle(
      `${clean(g.names[0])} vs ${clean(g.names[1])}`
        .slice(0, 256)
    );

    if (g.phase === 'invited') {
      text =
        `${t.invitation}\n\n` +
        `<@${g.users[1]}> · ` +
        `${lang === 'en' ? 'Accept before' : 'Accepte avant'} ` +
        `<t:${Math.floor(g.expires / 1000)}:T>.`;

      components = [
        row(
          button(
            `d:${g.id}:accept:0:${lang}`,
            t.accept,
            ButtonStyle.Success,
            '🤝'
          ),
          button(
            `d:${g.id}:leave:0:${lang}`,
            t.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (g.phase === 'waiting') {
      const sh = g.shots.length % 2;

      text =
        `⚽ <@${g.users[sh]}> · ` +
        `${lang === 'en' ? 'Shooter' : 'Tireur'}` +
        `${g.pending.shot !== undefined ? ' 🔒' : ''}\n\n` +
        `🧤 <@${g.users[1 - sh]}> · ` +
        `${lang === 'en' ? 'Goalkeeper' : 'Gardien'}` +
        `${g.pending.dive !== undefined ? ' 🔒' : ''}\n\n` +
        `${t.wait}\n` +
        `⏱️ <t:${Math.floor(g.expires / 1000)}:R>`;

      components = [
        row(
          button(
            `d:${g.id}:shot:${g.shots.length}:${lang}`,
            t.shoot,
            ButtonStyle.Danger,
            '⚽'
          ),
          button(
            `d:${g.id}:dive:${g.shots.length}:${lang}`,
            t.dive,
            ButtonStyle.Primary,
            '🧤'
          ),
          button(
            `d:${g.id}:leave:${g.shots.length}:${lang}`,
            t.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (g.phase === 'result') {
      const last = g.shots.at(-1);

      text =
        `${last.goal ? t.goal : t.save}\n\n` +
        `${reveal(last, lang)}\n\n` +
        `${lang === 'en' ? 'Time to swap roles.' : 'On échange les rôles.'}\n` +
        `⏱️ <t:${Math.floor(g.expires / 1000)}:R>`;

      components = [
        row(
          button(
            `d:${g.id}:next:${g.shots.length}:${lang}`,
            t.next,
            ButtonStyle.Primary,
            '⚽'
          ),
          button(
            `d:${g.id}:leave:${g.shots.length}:${lang}`,
            t.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (g.phase === 'finished') {
      const a = score(g, 0);
      const b = score(g, 1);

      text =
        `${
          a === b
            ? t.draw
            : `${t.winner} <@${g.users[a > b ? 0 : 1]}>`
        }\n\n` +
        `**${a} - ${b}**\n\n` +
        t.closed;
    } else {
      text =
        g.phase === 'expired'
          ? t.expiredText
          : t.closed;
    }
  } else {
    const last = g.shots.at(-1);

    embed.setTitle(
      g.type === 'training'
        ? `👟 ${t.training}`
        : `⚽ ${t.daily}`
    );

    if (run) {
      text =
        lang === 'en'
          ? 'The stadium holds its breath…'
          : 'Le stade retient son souffle…';
    } else if (g.phase === 'waiting') {
      text =
        `**${lang === 'en' ? 'Penalty' : 'Tir'} ${g.shots.length + 1}/5**\n\n` +
        t.soloHint +
        (g.type === 'training'
          ? `\n\n${t.trainingHint}`
          : '');

      components = [
        directions(
          `s:${g.id}:${g.shots.length}`,
          lang
        ),
      ];
    } else if (g.phase === 'result') {
      text =
        `${last.goal ? t.goal : t.save}\n\n` +
        `${reveal(last, lang)}\n\n` +
        `**${score(g)} ${lang === 'en' ? 'goal(s)' : 'but(s)'}` +
        ` · ${g.shots.length}/5 ` +
        `${lang === 'en' ? 'shots taken' : 'tirs joués'}**`;

      components = [
        row(
          button(
            `n:${g.id}:${g.shots.length}:${lang}`,
            t.next,
            ButtonStyle.Primary,
            '⚽'
          )
        ),
      ];
    } else {
      text =
        `${t.finished}\n\n` +
        `**${score(g)}/5 ${lang === 'en' ? 'goals' : 'buts'}` +
        (g.type === 'solo'
          ? ` · +${score(g)} point(s)`
          : '') +
        `**\n\n` +
        (g.type === 'solo'
          ? t.saved
          : t.practiceSaved);

      if (g.scoreExcluded) {
        text =
          `${t.finished}\n\n` +
          (lang === 'en'
            ? 'This set was played before the leaderboard reset. It no longer awards points. Your next daily set is available tomorrow.'
            : 'Cette série a été jouée avant la remise à zéro du classement. Elle ne rapporte plus de points. Ta prochaine série quotidienne sera disponible demain.');
      }

      components = [
        row(
          button(
            `p:${g.event}:training:${lang}`,
            t.training,
            ButtonStyle.Secondary,
            '👟'
          ),
          button(
            `p:${g.event}:ranking:${lang}`,
            t.ranking,
            ButtonStyle.Secondary,
            '🏆'
          )
        ),
      ];
    }
  }

  if (run) components = [];

  embed.setDescription(text);

  return {
    content: '',
    embeds: [embed],
    files: [img],
    attachments: [],
    components,
    allowedMentions: { parse: [] },
  };
}

function reveal(last, lang) {
  const t = T[lang];
  const labels = [t.left, t.centre, t.right];

  return `⚽ ${labels[last.shot]}  ·  🧤 ${labels[last.dive]}`;
}

async function privateGamePayload(g, lang, user) {
  const payload = await gamePayload(g, lang);

  if (g.phase === 'invited' && g.users[0] === user) {
    payload.components = [
      row(
        button(
          `d:${g.id}:leave:0:${lang}`,
          T[lang].leave,
          ButtonStyle.Secondary
        )
      ),
    ];
  }

  if (g.phase === 'waiting') {
    const role =
      g.users[g.shots.length % 2] === user
        ? 'shot'
        : 'dive';

    const buttons = [];

    if (g.pending[role] === undefined) {
      buttons.push(
        button(
          `d:${g.id}:${role}:${g.shots.length}:${lang}`,
          role === 'shot'
            ? T[lang].shoot
            : T[lang].dive,
          role === 'shot'
            ? ButtonStyle.Danger
            : ButtonStyle.Primary,
          role === 'shot' ? '⚽' : '🧤'
        )
      );
    }

    buttons.push(
      button(
        `d:${g.id}:leave:${g.shots.length}:${lang}`,
        T[lang].leave,
        ButtonStyle.Secondary
      )
    );

    payload.components = [row(...buttons)];
  }

  return payload;
}

function leaderboardPayload(engine, lang, ownId) {
  const e = engine.store.event();
  const rows = engine.rankings(e);
  const t = T[lang];

  const lines = rows.slice(0, 10).map(u => {
    const position =
      u.rank <= 3
        ? ['🥇', '🥈', '🥉'][u.rank - 1]
        : `**${u.rank}.**`;

    return `${position} <@${u.id}> · **${u.points} pts**`;
  });

  return {
    embeds: [
      baseEmbed()
        .setTitle(
          `🏆 ${t.ranking} · ${e.title}`.slice(0, 256)
        )
        .setDescription(
          lines.join('\n\n') || t.noScores
        )
        .setFooter({
          text:
            `${displayDate(e.start, lang)} → ${displayDate(e.end, lang)}` +
            ' • ' +
            (lang === 'en'
              ? 'FR + EN • Equal points = shared rank'
              : 'FR + EN • À égalité de points, même place'),
        })
        .setTimestamp(),
    ],
    components: [
      row(
        button(
          `p:${e.id}:myrank:${lang}`,
          lang === 'en'
            ? 'View my rank'
            : 'Mon classement',
          ButtonStyle.Primary,
          '📍'
        )
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

const staffCommand = (name, description) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    );

function commands() {
  return [
    staffCommand(
      'penalty-installer',
      'Publier le menu du jeu dans un salon'
    )
      .addChannelOption(o =>
        o
          .setName('salon')
          .setDescription('Salon du jeu')
          .addChannelTypes(0)
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('langue')
          .setDescription(
            'Langue de ce menu, classement commun'
          )
          .addChoices(
            { name: 'Français', value: 'fr' },
            { name: 'English', value: 'en' }
          )
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('image')
          .setDescription(
            'URL HTTPS facultative pour le menu'
          )
      ),

    staffCommand(
      'penalty-evenement',
      'Créer une nouvelle édition, en archivant la précédente'
    )
      .addStringOption(o =>
        o
          .setName('titre')
          .setDescription('Nom de cette édition')
          .setMaxLength(100)
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('debut')
          .setDescription(
            'Premier jour inclus, AAAA-MM-JJ, heure de Paris'
          )
          .setRequired(true)
      )
      .addStringOption(o =>
        o
          .setName('fin')
          .setDescription(
            'Dernier jour inclus, AAAA-MM-JJ, heure de Paris'
          )
          .setRequired(true)
      )
      .addBooleanOption(o =>
        o
          .setName('confirmer')
          .setDescription(
            'Oui = nouvelle édition et nouveau classement. Anciennes données conservées.'
          )
          .setRequired(true)
      ),

    staffCommand(
      'penalty-classement',
      'Voir le classement ou publier un classement qui se met à jour'
    )
      .addChannelOption(o =>
        o
          .setName('salon')
          .setDescription(
            'Facultatif : y publier le classement'
          )
          .addChannelTypes(0)
      )
      .addStringOption(o =>
        o
          .setName('langue')
          .setDescription('Langue du classement')
          .addChoices(
            { name: 'Français', value: 'fr' },
            { name: 'English', value: 'en' }
          )
      ),

    staffCommand(
      'penalty-export',
      'Exporter tous les scores en CSV, sans limite de participants'
    ).addStringOption(o =>
      o
        .setName('edition')
        .setDescription(
          'Identifiant facultatif d’une ancienne édition'
        )
    ),

    staffCommand(
      'penalty-diagnostic',
      'Voir le stockage, les dates, les éditions et les parties actives'
    ),

    staffCommand(
      'penalty-fermer-duel',
      'Fermer un duel bloqué sans toucher aux points'
    ).addStringOption(o =>
      o
        .setName('id')
        .setDescription(
          'ID du duel affiché en bas du message'
        )
        .setRequired(true)
    ),

    staffCommand(
      'penalty-reset-classement',
      'Remettre les scores à zéro avec une archive, sans redonner de tentative'
    ).addBooleanOption(o =>
      o
        .setName('confirmer')
        .setDescription(
          'Oui = remettre les points FR et EN à zéro. Les tentatives du jour restent utilisées.'
        )
        .setRequired(true)
    ),
  ].map(c => c.toJSON());
}

async function main() {
  for (const k of [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
  ]) {
    if (!process.env[k]) {
      throw new Error(`Variable manquante : ${k}`);
    }
  }

  const dir =
    process.env.DATA_DIR ||
    path.join(__dirname, 'data');

  if (
    process.env.RAILWAY_ENVIRONMENT_ID &&
    !process.env.DATA_DIR
  ) {
    throw new Error(
      'Sur Railway, attache un volume /data puis ajoute DATA_DIR=/data.'
    );
  }

  if (
    process.env.RAILWAY_ENVIRONMENT_ID &&
    !process.env.RAILWAY_VOLUME_MOUNT_PATH
  ) {
    throw new Error(
      'Railway ne détecte aucun volume attaché au service du bot. Attache le volume avant de redéployer.'
    );
  }

  if (
    process.env.RAILWAY_VOLUME_MOUNT_PATH &&
    path.resolve(dir) !==
      path.resolve(
        process.env.RAILWAY_VOLUME_MOUNT_PATH
      )
  ) {
    throw new Error(
      'DATA_DIR ne correspond pas au chemin du volume Railway.'
    );
  }

  const timeoutSeconds = Number(
    process.env.DUEL_TIMEOUT_SECONDS || 180
  );

  if (
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 60 ||
    timeoutSeconds > 900
  ) {
    throw new Error(
      'DUEL_TIMEOUT_SECONDS doit être compris entre 60 et 900.'
    );
  }

  const store = new Store(dir, {
    title:
      process.env.EVENT_TITLE ||
      'Les Pénaltys de la peur',
    start:
      process.env.EVENT_START ||
      dayInParis(),
    end:
      process.env.EVENT_END ||
      dayInParis(),
  });

  const engine = new Engine(store, {
    timeout: timeoutSeconds * 1000,
  });

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
    allowedMentions: { parse: [] },
  });

  const queues = new Map();
  const viewers = new Map();
  const timers = new Set();
  const deleting = new Set();

  let boardsDirty = 1;
  let refreshing = false;
  let closing = false;

  const later = fn => {
    const timer = setTimeout(() => {
      timers.delete(timer);

      Promise.resolve()
        .then(fn)
        .catch(() => {});
    }, 2000);

    timer.unref();
    timers.add(timer);
  };

  const deletePrivate = i =>
    later(() => i.deleteReply());

  async function remember(g, i, lang) {
    if (!viewers.has(g.id)) {
      viewers.set(g.id, new Map());
    }

    const group = viewers.get(g.id);
    const previous = group.get(i.user.id);

    const messageId = i.fetchReply
      ? await i.fetchReply()
          .then(m => m.id)
          .catch(() => null)
      : null;

    if (
      previous?.messageId &&
      messageId &&
      previous.messageId !== messageId
    ) {
      deletePrivate(previous.i);
    }

    group.set(i.user.id, {
      i,
      lang,
      messageId,
    });
  }

  const queue = (key, fn) => {
    const next = (
      queues.get(key) || Promise.resolve()
    )
      .catch(() => {})
      .then(fn);

    queues.set(key, next);

    next
      .finally(() => {
        if (queues.get(key) === next) {
          queues.delete(key);
        }
      })
      .catch(() => {});

    return next;
  };

  const getGame = id => {
    const e = store.event();
    const g = e.games[id];

    if (!g) throw new GameError('missing');

    return g;
  };

  const publicDuel = id =>
    queue(id, async () => {
      const g = getGame(id);

      const finished = [
        'finished',
        'expired',
        'cancelled',
      ].includes(g.phase);

      for (
        const [user, view] of viewers.get(id) || []
      ) {
        try {
          await view.i.editReply(
            await privateGamePayload(
              g,
              view.lang,
              user
            )
          );
        } catch (err) {
          viewers.get(id)?.delete(user);

          console.error(
            'Écran privé du duel :',
            err.code || err.name
          );
        }
      }

      if (finished && viewers.has(id)) {
        for (
          const view of viewers.get(id).values()
        ) {
          deletePrivate(view.i);
        }

        viewers.delete(id);
      }

      if (!g.message) return;

      try {
        const ch =
          await client.channels.fetch(g.channel);

        if (!ch?.isTextBased()) return;

        if (
          g.privateUI &&
          g.phase !== 'invited'
        ) {
          if (!deleting.has(g.message)) {
            deleting.add(g.message);

            await ch.messages.edit(g.message, {
              content: finished
                ? T[g.lang].closed
                : g.lang === 'en'
                  ? '🤝 Challenge accepted. Both players are playing privately.'
                  : '🤝 Défi accepté. Les deux supporters jouent en privé.',
              embeds: [],
              attachments: [],
              components: [],
              allowedMentions: { parse: [] },
            });

            later(async () => {
              try {
                await ch.messages.delete(
                  g.message
                );
              } finally {
                deleting.delete(g.message);

                store.change((s, e) => {
                  if (
                    e.games[id]?.message ===
                    g.message
                  ) {
                    e.games[id].message = null;
                  }
                });
              }
            });
          }
        } else {
          await ch.messages.edit(
            g.message,
            await gamePayload(g, g.lang)
          );

          if (
            finished &&
            !deleting.has(g.message)
          ) {
            deleting.add(g.message);

            later(async () => {
              try {
                await ch.messages.delete(
                  g.message
                );
              } finally {
                deleting.delete(g.message);

                store.change((s, e) => {
                  if (
                    e.games[id]?.message ===
                    g.message
                  ) {
                    e.games[id].message = null;
                  }
                });
              }
            });
          }
        }
      } catch (err) {
        if (
          [10003, 10008].includes(err.code)
        ) {
          store.change((s, e) => {
            if (e.games[id]) {
              e.games[id].message = null;
            }
          });

          if (
            (
              !g.privateUI ||
              g.phase === 'invited'
            ) &&
            [
              'invited',
              'waiting',
              'result',
            ].includes(g.phase)
          ) {
            engine.end(id, '', true);
          }
        } else {
          console.error(
            'Affichage duel :',
            err.code || err.name
          );
        }
      }
    });

  const refreshBoards = async () => {
    if (refreshing || !boardsDirty) return;

    refreshing = true;
    const version = boardsDirty;

    try {
      for (const b of store.event().boards) {
        try {
          const ch =
            await client.channels.fetch(
              b.channel
            );

          await ch.messages.edit(
            b.message,
            leaderboardPayload(engine, b.lang)
          );
        } catch (err) {
          if (
            [10003, 10008].includes(err.code)
          ) {
            store.change((s, e) => {
              e.boards = e.boards.filter(
                x => x.message !== b.message
              );
            });
          } else {
            console.error(
              'Classement :',
              err.code || err.name
            );
          }
        }
      }

      if (boardsDirty === version) {
        boardsDirty = 0;
      }
    } finally {
      refreshing = false;
    }
  };

  const isStaff = i =>
    i.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    (
      process.env.ADMIN_ROLE_ID &&
      i.member?.roles?.cache?.has(
        process.env.ADMIN_ROLE_ID
      )
    ) ||
    (
      process.env.ADMIN_ROLE_ID &&
      Array.isArray(i.member?.roles) &&
      i.member.roles.includes(
        process.env.ADMIN_ROLE_ID
      )
    );

  async function onCommand(i) {
    if (!isStaff(i)) {
      throw new GameError('staff');
    }

    await i.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    if (
      i.commandName === 'penalty-installer'
    ) {
      const ch =
        i.options.getChannel('salon', true);

      const lang =
        i.options.getString('langue', true);

      const image =
        i.options.getString('image');

      if (
        image &&
        !/^https:\/\/\S+$/i.test(image)
      ) {
        return i.editReply(
          'Pour l’image, utilise un lien HTTPS direct.'
        );
      }

      const event = store.event();

      const payload = panelPayload(
        event,
        lang,
        image
      );

      if (!image) {
        const name =
          `welcome-${event.id}-${lang}.png`;

        payload.files = [
          new AttachmentBuilder(
            await arena(
              {
                id: event.id,
                type: 'solo',
                phase: 'waiting',
                shots: [],
                names: ['PARIS'],
                users: [],
              },
              lang,
              'cover'
            ),
            { name }
          ),
        ];

        payload.embeds[0].setImage(
          `attachment://${name}`
        );
      }

      const msg = await ch.send(payload);

      store.change((s, e) => {
        e.panels.push({
          channel: ch.id,
          message: msg.id,
          lang,
        });
      });

      return i.editReply(
        `Menu installé dans <#${ch.id}>. Les menus français et anglais partagent le même classement.`
      );
    }

    if (
      i.commandName === 'penalty-evenement'
    ) {
      if (
        !i.options.getBoolean(
          'confirmer',
          true
        )
      ) {
        return i.editReply(
          'Aucun changement. Mets confirmer sur Oui pour créer une nouvelle édition.'
        );
      }

      const event = createEvent(
        i.options.getString('titre', true),
        i.options.getString('debut', true),
        i.options.getString('fin', true)
      );

      const previous = store.event();

      for (
        const g of Object.values(
          previous.games
        )
      ) {
        if (
          g.type === 'duel' &&
          [
            'invited',
            'waiting',
            'result',
          ].includes(g.phase)
        ) {
          engine.end(g.id, '', true);
          await publicDuel(g.id);
        }
      }

      store.change(s => {
        s.events[event.id] = event;
        s.current = event.id;
      });

      boardsDirty++;

      return i.editReply(
        `Nouvelle édition : **${clean(event.title)}**, du ${event.start} au ${event.end}, jours inclus (heure de Paris).\n` +
        'L’ancien classement est archivé. Réinstalle les menus FR/EN et le classement avec les commandes habituelles.\n' +
        `ID de l’édition : \`${event.id}\``
      );
    }

    if (
      i.commandName === 'penalty-classement'
    ) {
      const lang =
        i.options.getString('langue') ||
        'fr';

      const ch =
        i.options.getChannel('salon');

      if (!ch) {
        return i.editReply(
          leaderboardPayload(engine, lang)
        );
      }

      const msg = await ch.send(
        leaderboardPayload(engine, lang)
      );

      store.change((s, e) => {
        e.boards.push({
          channel: ch.id,
          message: msg.id,
          lang,
        });
      });

      return i.editReply(
        `Classement publié dans <#${ch.id}>. Ce message sera actualisé après les séries terminées, sous 15 secondes.`
      );
    }

    if (
      i.commandName ===
      'penalty-reset-classement'
    ) {
      if (
        !i.options.getBoolean(
          'confirmer',
          true
        )
      ) {
        return i.editReply(
          'Aucun changement. Choisis Oui pour remettre le classement à zéro.'
        );
      }

      const archive =
        engine.resetRankings(i.user.id);

      boardsDirty++;

      await refreshBoards();

      return i.editReply(
        'Classement commun FR/EN remis à zéro.\n' +
        'Les tentatives du jour restent utilisées et les séries en cours peuvent être terminées.\n' +
        `Archive des anciens scores : \`${archive}\`. Tu peux la télécharger avec /penalty-export edition:${archive}.\n` +
        'Les menus existants restent valides.'
      );
    }

    if (
      i.commandName === 'penalty-export'
    ) {
      const state = store.read();

      const event = state.events[
        i.options.getString('edition') ||
        state.current
      ];

      if (!event) {
        return i.editReply(
          'Édition introuvable. Regarde /penalty-diagnostic pour les identifiants.'
        );
      }

      const csvCell = v =>
        `"${String(v)
          .replace(/^[=+\-@]/, "'$&")
          .replace(/"/g, '""')}"`;

      const csv =
        '\uFEFF' +
        [
          [
            'rang',
            'discord_id',
            'pseudo',
            'points',
            'series_terminees',
            'meilleure_serie',
          ],
          ...engine.rankings(event).map(u => [
            u.rank,
            u.id,
            u.name,
            u.points,
            u.days,
            u.best,
          ]),
        ]
          .map(r =>
            r.map(csvCell).join(';')
          )
          .join('\r\n');

      return i.editReply({
        content:
          'Tous les scores de cette édition. Aucun transfert automatique vers le bot des pronos.',
        files: [
          new AttachmentBuilder(
            Buffer.from(csv),
            {
              name:
                `penalties-${event.id}.csv`,
            }
          ),
        ],
      });
    }

    if (
      i.commandName === 'penalty-diagnostic'
    ) {
      const s = store.read();
      const e = store.event();

      const editions = Object.values(
        s.events
      )
        .slice(-20)
        .map(
          x =>
            `\`${x.id}\` · ${clean(x.title)} (${x.start} → ${x.end})`
        )
        .join('\n');

      return i.editReply({
        embeds: [
          baseEmbed()
            .setTitle('Diagnostic')
            .setDescription(
              `Édition : **${clean(e.title)}**\n` +
              `Dates : ${e.start} → ${e.end}\n` +
              `Aujourd’hui à Paris : ${dayInParis()}\n` +
              `Joueurs classés : ${engine.rankings().length}\n` +
              `Duels actifs : ${
                Object.values(e.games)
                  .filter(
                    g =>
                      g.type === 'duel' &&
                      [
                        'invited',
                        'waiting',
                        'result',
                      ].includes(g.phase)
                  ).length
              }\n` +
              `Stockage : \`${clean(store.file)}\`\n` +
              `Volume Railway détecté : ${
                process.env.RAILWAY_VOLUME_MOUNT_PATH
                  ? 'oui'
                  : 'non / environnement local'
              }\n\n` +
              'Éditions archivées et actuelle :\n' +
              editions
            )
            .setFooter({
              text:
                'Une seule réplique du service • aucune donnée secrète affichée',
            }),
        ],
      });
    }

    if (
      i.commandName ===
      'penalty-fermer-duel'
    ) {
      const g = engine.end(
        i.options.getString('id', true),
        i.user.id,
        true
      );

      await publicDuel(g.id);

      return i.editReply(
        'Duel fermé. Aucun point n’a été modifié.'
      );
    }
  }

  async function onComponent(i) {
    const parts =
      i.customId.split(':');

    const kind = parts[0];

    const lang =
      parts.at(-1) === 'en'
        ? 'en'
        : 'fr';

    const t = T[lang];

    if (kind === 'p') {
      const [, eventId, action] = parts;
      const e = store.event();

      if (e.id !== eventId) {
        throw new GameError('oldEvent');
      }

      await i.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (
        action === 'daily' ||
        action === 'training'
      ) {
        const g = engine.solo(
          i.user.id,
          i.member?.displayName ||
            i.user.globalName ||
            i.user.username,
          action === 'training'
        );

        return i.editReply(
          await gamePayload(g, lang)
        );
      }

      if (action === 'rules') {
        return i.editReply({
          embeds: [
            baseEmbed()
              .setTitle(`📖 ${t.rules}`)
              .setDescription(t.rulesText),
          ],
        });
      }

      if (action === 'ranking') {
        return i.editReply(
          leaderboardPayload(
            engine,
            lang,
            i.user.id
          )
        );
      }

      if (action === 'myrank') {
        const ranks =
          engine.rankings();

        const own = ranks.find(
          u => u.id === i.user.id
        );

        return i.editReply({
          embeds: [
            baseEmbed()
              .setTitle(
                lang === 'en'
                  ? '📍 My rank'
                  : '📍 Mon classement'
              )
              .setDescription(
                own
                  ? `🏆 **#${own.rank} / ${ranks.length}**\n\n` +
                    `⚽ **${own.points} points**\n\n` +
                    (
                      lang === 'en'
                        ? 'One shared leaderboard for French and English players.'
                        : 'Un classement commun aux joueurs français et anglais.'
                    )
                  : t.noRank
              ),
          ],
          components: [],
        });
      }

      if (action === 'profile') {
        const own =
          engine.rankings().find(
            u => u.id === i.user.id
          );

        const today =
          Object.values(e.games).find(
            g =>
              g.type === 'solo' &&
              g.users[0] === i.user.id &&
              g.day === dayInParis()
          );

        return i.editReply({
          embeds: [
            baseEmbed()
              .setTitle(`📊 ${t.profile}`)
              .setDescription(
                `${
                  lang === 'en'
                    ? '**Event points**'
                    : '**Points de l’événement**'
                } : ${own?.points || 0}\n\n` +
                `🏆 ${
                  own
                    ? `#${own.rank}`
                    : t.noRank
                }\n\n` +
                `⚽ ${
                  lang === 'en'
                    ? 'Completed sets'
                    : 'Séries terminées'
                } : ${own?.days || 0}\n\n` +
                `🔥 ${
                  lang === 'en'
                    ? 'Best set'
                    : 'Meilleure série'
                } : ${own?.best || 0}/5\n\n` +
                `🗓️ ${
                  lang === 'en'
                    ? 'Today'
                    : 'Aujourd’hui'
                } : ${
                  today
                    ? `${today.shots.length}/5 ${
                        lang === 'en'
                          ? 'shots taken'
                          : 'tirs joués'
                      }`
                    : '0/5'
                }`
              ),
          ],
        });
      }

      if (action === 'duel') {
        engine.active(e);

        const active =
          Object.values(e.games).find(
            g =>
              g.type === 'duel' &&
              [
                'invited',
                'waiting',
                'result',
              ].includes(g.phase) &&
              g.expires > Date.now() &&
              g.users.includes(i.user.id)
          );

        if (active) {
          await remember(
            active,
            i,
            lang
          );

          return i.editReply(
            await privateGamePayload(
              active,
              lang,
              i.user.id
            )
          );
        }

        return i.editReply({
          content: t.pickOpponent,
          components: [
            new ActionRowBuilder()
              .addComponents(
                new UserSelectMenuBuilder()
                  .setCustomId(
                    `u:${e.id}:${lang}`
                  )
                  .setPlaceholder(
                    lang === 'en'
                      ? 'Choose a supporter'
                      : 'Choisir un supporter'
                  )
                  .setMinValues(1)
                  .setMaxValues(1)
              ),
          ],
        });
      }

      throw new GameError('invalid');
    }

    if (
      kind === 's' ||
      kind === 'n'
    ) {
      await i.deferUpdate();

      const g =
        kind === 's'
          ? engine.shoot(
              parts[1],
              i.user.id,
              Number(parts[2]),
              Number(parts[3])
            )
          : engine.next(
              parts[1],
              i.user.id,
              Number(parts[2])
            );

      if (kind === 's') {
        if (
          g.type === 'solo' &&
          g.phase === 'finished'
        ) {
          boardsDirty++;
        }

        try {
          await i.editReply(
            await gamePayload(
              g,
              lang,
              true
            )
          );

          await sleep(650);
        } catch (err) {
          console.error(
            'Transition visuelle :',
            err.code || err.name
          );
        }
      }

      return i.editReply(
        await gamePayload(g, lang)
      );
    }

    if (kind === 'u') {
      await i.deferUpdate();

      if (
        parts[1] !== store.event().id
      ) {
        throw new GameError('oldEvent');
      }

      const target =
        await i.guild.members.fetch(
          i.values[0]
        );

      if (target.user.bot) {
        throw new GameError('bot');
      }

      const g = engine.challenge(
        i.user.id,
        i.member.displayName ||
          i.user.username,
        target.id,
        target.displayName,
        i.channelId,
        lang
      );

      try {
        store.change((s, e) => {
          e.games[g.id].privateUI = true;
        });

        const payload =
          await gamePayload(g, lang);

        const message =
          await i.channel.send({
            ...payload,
            content: `<@${target.id}>`,
            allowedMentions: {
              users: [target.id],
            },
          });

        store.change((s, e) => {
          e.games[g.id].message =
            message.id;
        });

        await remember(g, i, lang);

        return i.editReply(
          await privateGamePayload(
            getGame(g.id),
            lang,
            i.user.id
          )
        );
      } catch (err) {
        engine.end(g.id, '', true);
        throw err;
      }
    }

    if (kind === 'd') {
      const [
        ,
        id,
        action,
        turnString,
      ] = parts;

      const g = getGame(id);
      const turn = Number(turnString);

      if (
        !g.users.includes(i.user.id)
      ) {
        throw new GameError('owner');
      }

      if (action === 'accept') {
        await i.deferReply({
          flags:
            MessageFlags.Ephemeral,
        });

        engine.accept(
          id,
          i.user.id
        );

        if (g.privateUI) {
          await remember(
            g,
            i,
            lang
          );
        } else {
          await i.editReply({
            content:
              lang === 'en'
                ? 'Challenge accepted.'
                : 'Défi accepté.',
          });
        }

        return publicDuel(id);
      }

      if (action === 'next') {
        await i.deferUpdate();

        engine.next(
          id,
          i.user.id,
          turn
        );

        if (g.privateUI) {
          await remember(
            g,
            i,
            lang
          );
        }

        return publicDuel(id);
      }

      await i.deferReply({
        flags:
          MessageFlags.Ephemeral,
      });

      if (action === 'leave') {
        return i.editReply({
          content: t.exitQuestion,
          components: [
            row(
              button(
                `q:${id}:${lang}`,
                t.confirm,
                ButtonStyle.Danger
              ),
              button(
                `x:${id}:${lang}`,
                t.cancel,
                ButtonStyle.Secondary
              )
            ),
          ],
        });
      }

      engine.active(store.event());

      if (
        g.phase !== 'waiting' ||
        g.shots.length !== turn
      ) {
        throw new GameError('stale');
      }

      if (
        g.expires < Date.now()
      ) {
        throw new GameError('expired');
      }

      if (
        !['shot', 'dive'].includes(
          action
        )
      ) {
        throw new GameError('invalid');
      }

      const expected =
        action === 'shot'
          ? turn % 2
          : 1 - turn % 2;

      if (
        g.users[expected] !== i.user.id
      ) {
        throw new GameError('owner');
      }

      if (
        g.pending[action] !== undefined
      ) {
        throw new GameError('locked');
      }

      return i.editReply({
        content:
          `${action === 'shot' ? '⚽' : '🧤'} ` +
          `**${
            action === 'shot'
              ? t.shoot
              : t.dive
          }**\n\n${t.privateHint}`,
        components: [
          directions(
            `c:${id}:${turn}:${action}`,
            lang
          ),
        ],
      });
    }

    if (kind === 'c') {
      await i.deferUpdate();

      engine.choose(
        parts[1],
        i.user.id,
        Number(parts[2]),
        parts[3],
        Number(parts[4])
      );

      await i.editReply({
        content: t.lockedChoice,
        embeds: [],
        components: [],
      });

      deletePrivate(i);

      return publicDuel(parts[1]);
    }

    if (kind === 'q') {
      await i.deferUpdate();

      engine.end(
        parts[1],
        i.user.id
      );

      await i.editReply({
        content: t.closed,
        components: [],
      });

      deletePrivate(i);

      return publicDuel(parts[1]);
    }

    if (kind === 'x') {
      await i.deferUpdate();

      await i.editReply({
        content:
          lang === 'en'
            ? 'Continue from your private game screen.'
            : 'Continue depuis ton écran de jeu privé.',
        components: [],
      });

      deletePrivate(i);
      return;
    }

    throw new GameError('invalid');
  }

  client.on(
    Events.InteractionCreate,
    async i => {
      if (
        i.guildId !==
          process.env.DISCORD_GUILD_ID ||
        (
          !i.isChatInputCommand() &&
          !i.isButton() &&
          !i.isUserSelectMenu()
        )
      ) {
        return;
      }

      try {
        if (i.isChatInputCommand()) {
          await onCommand(i);
        } else {
          await onComponent(i);
        }
      } catch (err) {
        const lang =
          i.customId?.endsWith(':en')
            ? 'en'
            : 'fr';

        const content =
          err instanceof GameError &&
          err.message === 'cooldown'
            ? lang === 'en'
              ? 'Please wait 30 seconds between invitations.'
              : 'Attends 30 secondes entre deux invitations.'
            : (
                T[lang].errors[
                  err instanceof GameError
                    ? err.message
                    : 'general'
                ] ||
                T[lang].errors.general
              );

        if (
          !(err instanceof GameError)
        ) {
          console.error(
            'Interaction :',
            err.code || err.name,
            err.message?.replace(
              /https:\/\/\S+/g,
              '[URL]'
            )
          );
        }

        try {
          if (
            i.replied ||
            i.deferred
          ) {
            await i.followUp({
              content,
              flags:
                MessageFlags.Ephemeral,
            });
          } else {
            await i.reply({
              content,
              flags:
                MessageFlags.Ephemeral,
            });
          }
        } catch {
          // Les données de jeu sont conservées
          // même si une réponse Discord expire.
        }
      }
    }
  );

  client.once(
    Events.ClientReady,
    async () => {
      console.log(
        `Connecté : ${client.user.tag}. Édition ${store.event().id}. Stockage SQLite actif.`
      );

      try {
        for (
          const g of engine.expire()
        ) {
          await publicDuel(g.id);
        }

        for (
          const g of Object.values(
            store.event().games
          )
        ) {
          if (
            g.type === 'duel' &&
            [
              'invited',
              'waiting',
              'result',
            ].includes(g.phase)
          ) {
            await publicDuel(g.id);
          }
        }

        await refreshBoards();
      } catch (err) {
        console.error(
          'Reprise :',
          err.code || err.name
        );
      }
    }
  );

  client.on(
    Events.Error,
    e =>
      console.error(
        'Discord :',
        e.code || e.name
      )
  );

  const tick = setInterval(
    async () => {
      if (closing) return;

      try {
        for (
          const g of engine.expire()
        ) {
          await publicDuel(g.id);
        }

        await refreshBoards();
      } catch (err) {
        console.error(
          'Entretien :',
          err.code || err.name
        );
      }
    },
    15000
  );

  tick.unref();

  await new REST({
    version: '10',
  })
    .setToken(
      process.env.DISCORD_TOKEN
    )
    .put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID
      ),
      { body: commands() }
    );

  await client.login(
    process.env.DISCORD_TOKEN
  );

  const shutdown = async () => {
    if (closing) return;

    closing = true;

    clearInterval(tick);

    for (const timer of timers) {
      clearTimeout(timer);
    }

    client.destroy();

    await Promise.allSettled(
      [...queues.values()]
    );

    store.close();

    process.removeListener(
      'SIGTERM',
      stop
    );

    process.removeListener(
      'SIGINT',
      stop
    );
  };

  const stop = () => {
    shutdown()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  };

  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  return {
    client,
    store,
    engine,
    onCommand,
    onComponent,
    publicDuel,
    shutdown,
  };
}

if (require.main === module) {
  main().catch(err => {
    console.error(
      'Démarrage :',
      err.message?.replace(
        /https:\/\/\S+/g,
        '[URL]'
      )
    );

    process.exit(1);
  });
}

module.exports = {
  commands,
  panelPayload,
  gamePayload,
  leaderboardPayload,
  directions,
  T,
  main,
  Engine,
};
