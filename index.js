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
  Engine,
  GameError,
  dayInParis,
  createEvent,
} = require('./engine');

const { arena } = require('./arena');

const C = {
  red: 0xE52649,
  blue: 0x073B67,
  gold: 0xFFAF67,
  green: 0x5BE9BB,
};

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const clean = value =>
  String(value)
    .replace(/([\\`*_~|>])/g, '\\$1')
    .replace(/@/g, '@\u200b');

const displayDate = (date, lang) =>
  new Intl.DateTimeFormat(
    lang === 'en' ? 'en-GB' : 'fr-FR',
    {
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }
  ).format(new Date(date));

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
      '🔒 Ton choix est enregistré et reste secret. Attends le choix de ton adversaire sur le message du duel.',

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
      '🔒 Your choice is saved and stays secret. Wait for your opponent’s choice on the duel message.',

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
  const component = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style);

  if (emoji) component.setEmoji(emoji);

  return component;
};

const row = (...buttons) =>
  new ActionRowBuilder().addComponents(buttons);

const baseEmbed = () =>
  new EmbedBuilder()
    .setColor(C.red)
    .setFooter({
      text: 'PARIS • Halloween',
    });

function panelPayload(event, lang, image) {
  const text = T[lang];

  const embed = baseEmbed()
    .setTitle(
      lang === 'en'
        ? 'PENALTIES OF FEAR 👻'
        : `${event.title} 👻`
    )
    .setDescription(text.intro)
    .addFields({
      name: '🗓️',
      value:
        `${displayDate(event.start, lang)} → ` +
        `${displayDate(event.end, lang)} · ` +
        (lang === 'en'
          ? 'Paris time'
          : 'Heure de Paris'),
    });

  if (image) embed.setImage(image);

  return {
    embeds: [embed],

    components: [
      row(
        button(
          `p:${event.id}:daily:${lang}`,
          text.daily,
          ButtonStyle.Danger,
          '⚽'
        ),

        button(
          `p:${event.id}:training:${lang}`,
          text.training,
          ButtonStyle.Secondary,
          '👟'
        ),

        button(
          `p:${event.id}:duel:${lang}`,
          text.duel,
          ButtonStyle.Primary,
          '🤝'
        )
      ),

      row(
        button(
          `p:${event.id}:ranking:${lang}`,
          text.ranking,
          ButtonStyle.Secondary,
          '🏆'
        ),

        button(
          `p:${event.id}:profile:${lang}`,
          text.profile,
          ButtonStyle.Secondary,
          '📊'
        ),

        button(
          `p:${event.id}:rules:${lang}`,
          text.rules,
          ButtonStyle.Secondary,
          '📖'
        )
      ),
    ],

    allowedMentions: {
      parse: [],
    },
  };
}

function directions(prefix, lang) {
  const text = T[lang];

  return row(
    button(
      `${prefix}:0:${lang}`,
      text.left,
      ButtonStyle.Primary,
      '↖️'
    ),

    button(
      `${prefix}:1:${lang}`,
      text.centre,
      ButtonStyle.Secondary,
      '⬆️'
    ),

    button(
      `${prefix}:2:${lang}`,
      text.right,
      ButtonStyle.Danger,
      '↗️'
    )
  );
}

function score(game, userIndex = 0) {
  return game.shots.filter(
    shot =>
      (
        game.type !== 'duel' ||
        shot.shooter === userIndex
      ) &&
      shot.goal
  ).length;
}

function reveal(last, lang) {
  const text = T[lang];

  const labels = [
    text.left,
    text.centre,
    text.right,
  ];

  return (
    `⚽ ${labels[last.shot]}  ·  ` +
    `🧤 ${labels[last.dive]}`
  );
}

async function gamePayload(
  game,
  lang,
  run = false
) {
  const text = T[lang];
  const duel = game.type === 'duel';

  const fileName =
    `arena-${game.id}-` +
    `${randomUUID().slice(0, 8)}.png`;

  const image = new AttachmentBuilder(
    await arena(
      game,
      lang,
      run ? 'run' : 'normal'
    ),
    {
      name: fileName,
    }
  );

  const embed = baseEmbed()
    .setImage(`attachment://${fileName}`);

  if (duel) {
    embed.setFooter({
      text: `PARIS • Duel ${game.id}`,
    });
  }

  let components = [];
  let description = '';

  if (duel) {
    embed.setTitle(
      `${clean(game.names[0])} vs ` +
      `${clean(game.names[1])}`.slice(0, 170)
    );

    if (game.phase === 'invited') {
      description =
        `${text.invitation}\n\n` +
        `<@${game.users[1]}> · ` +
        (lang === 'en'
          ? 'Accept before'
          : 'Accepte avant') +
        ` <t:${Math.floor(
          game.expires / 1000
        )}:T>.`;

      components = [
        row(
          button(
            `d:${game.id}:accept:0:${lang}`,
            text.accept,
            ButtonStyle.Success,
            '🤝'
          ),

          button(
            `d:${game.id}:leave:0:${lang}`,
            text.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (game.phase === 'waiting') {
      const shooter = game.shots.length % 2;

      description =
        `⚽ <@${game.users[shooter]}> · ` +
        (lang === 'en' ? 'Shooter' : 'Tireur') +
        (
          game.pending.shot !== undefined
            ? ' 🔒'
            : ''
        ) +
        `\n\n🧤 <@${game.users[1 - shooter]}> · ` +
        (lang === 'en'
          ? 'Goalkeeper'
          : 'Gardien') +
        (
          game.pending.dive !== undefined
            ? ' 🔒'
            : ''
        ) +
        `\n\n${text.wait}\n` +
        `⏱️ <t:${Math.floor(
          game.expires / 1000
        )}:R>`;

      components = [
        row(
          button(
            `d:${game.id}:shot:${game.shots.length}:${lang}`,
            text.shoot,
            ButtonStyle.Danger,
            '⚽'
          ),

          button(
            `d:${game.id}:dive:${game.shots.length}:${lang}`,
            text.dive,
            ButtonStyle.Primary,
            '🧤'
          ),

          button(
            `d:${game.id}:leave:${game.shots.length}:${lang}`,
            text.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (game.phase === 'result') {
      const last = game.shots.at(-1);

      description =
        `${last.goal ? text.goal : text.save}\n\n` +
        `${reveal(last, lang)}\n\n` +
        (lang === 'en'
          ? 'Time to swap roles.'
          : 'On échange les rôles.') +
        `\n⏱️ <t:${Math.floor(
          game.expires / 1000
        )}:R>`;

      components = [
        row(
          button(
            `d:${game.id}:next:${game.shots.length}:${lang}`,
            text.next,
            ButtonStyle.Primary,
            '⚽'
          ),

          button(
            `d:${game.id}:leave:${game.shots.length}:${lang}`,
            text.leave,
            ButtonStyle.Secondary
          )
        ),
      ];
    } else if (game.phase === 'finished') {
      const firstScore = score(game, 0);
      const secondScore = score(game, 1);

      const result =
        firstScore === secondScore
          ? text.draw
          : (
            `${text.winner} ` +
            `<@${
              game.users[
                firstScore > secondScore ? 0 : 1
              ]
            }>`
          );

      description =
        `${result}\n\n` +
        `**${firstScore} - ${secondScore}**\n\n` +
        text.closed;
    } else {
      description =
        game.phase === 'expired'
          ? text.expiredText
          : text.closed;
    }
  } else {
    const last = game.shots.at(-1);

    embed.setTitle(
      game.type === 'training'
        ? `👟 ${text.training}`
        : `⚽ ${text.daily}`
    );

    if (run) {
      description =
        lang === 'en'
          ? 'The stadium holds its breath…'
          : 'Le stade retient son souffle…';
    } else if (game.phase === 'waiting') {
      description =
        `**${
          lang === 'en' ? 'Penalty' : 'Tir'
        } ${game.shots.length + 1}/5**\n\n` +
        text.soloHint +
        (
          game.type === 'training'
            ? `\n\n${text.trainingHint}`
            : ''
        );

      components = [
        directions(
          `s:${game.id}:${game.shots.length}`,
          lang
        ),
      ];
    } else if (game.phase === 'result') {
      description =
        `${last.goal ? text.goal : text.save}\n\n` +
        `${reveal(last, lang)}\n\n` +
        `**${score(game)} ${
          lang === 'en' ? 'goal(s)' : 'but(s)'
        } · ${game.shots.length}/5 ${
          lang === 'en'
            ? 'shots taken'
            : 'tirs joués'
        }**`;

      components = [
        row(
          button(
            `n:${game.id}:${game.shots.length}:${lang}`,
            text.next,
            ButtonStyle.Primary,
            '⚽'
          )
        ),
      ];
    } else {
      description =
        `${text.finished}\n\n` +
        `**${score(game)}/5 ${
          lang === 'en' ? 'goals' : 'buts'
        }${
          game.type === 'solo'
            ? ` · +${score(game)} point(s)`
            : ''
        }**\n\n` +
        (
          game.type === 'solo'
            ? text.saved
            : text.practiceSaved
        );

      components = [
        row(
          button(
            `p:${game.event}:training:${lang}`,
            text.training,
            ButtonStyle.Secondary,
            '👟'
          ),

          button(
            `p:${game.event}:ranking:${lang}`,
            text.ranking,
            ButtonStyle.Secondary,
            '🏆'
          )
        ),
      ];
    }
  }

  if (run) {
    components = [];
  }

  embed.setDescription(description);

  return {
    content: '',
    embeds: [embed],
    files: [image],
    attachments: [],
    components,

    allowedMentions: {
      parse: [],
    },
  };
}

function leaderboardPayload(
  engine,
  lang,
  ownId
) {
  const event = engine.store.event();
  const rankings = engine.rankings(event);
  const text = T[lang];

  const lines = rankings
    .slice(0, 15)
    .map(
      user =>
        `${
          user.rank <= 3
            ? ['🥇', '🥈', '🥉'][user.rank - 1]
            : `**${user.rank}.**`
        } <@${user.id}> · **${user.points} pts**`
    );

  const own = rankings.find(
    user => user.id === ownId
  );

  if (
    own &&
    !rankings
      .slice(0, 15)
      .some(user => user.id === ownId)
  ) {
    lines.push(
      `\n**${own.rank}.** <@${own.id}> · ` +
      `**${own.points} pts**`
    );
  }

  return {
    embeds: [
      baseEmbed()
        .setTitle(
          `🏆 ${text.ranking} · ${event.title}`
            .slice(0, 256)
        )
        .setDescription(
          lines.join('\n\n') || text.noScores
        )
        .setFooter({
          text:
            `${displayDate(event.start, lang)} → ` +
            `${displayDate(event.end, lang)} • ` +
            (
              lang === 'en'
                ? 'Equal points = shared rank'
                : 'À égalité de points, même place'
            ),
        })
        .setTimestamp(),
    ],

    components: [],

    allowedMentions: {
      parse: [],
    },
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
      .addChannelOption(option =>
        option
          .setName('salon')
          .setDescription('Salon du jeu')
          .addChannelTypes(0)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('langue')
          .setDescription(
            'Langue de ce menu, classement commun'
          )
          .addChoices(
            {
              name: 'Français',
              value: 'fr',
            },
            {
              name: 'English',
              value: 'en',
            }
          )
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('image')
          .setDescription(
            'URL HTTPS facultative pour le menu'
          )
      ),

    staffCommand(
      'penalty-evenement',
      'Créer une nouvelle édition, en archivant la précédente'
    )
      .addStringOption(option =>
        option
          .setName('titre')
          .setDescription('Nom de cette édition')
          .setMaxLength(100)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('debut')
          .setDescription(
            'Premier jour inclus, AAAA-MM-JJ, heure de Paris'
          )
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('fin')
          .setDescription(
            'Dernier jour inclus, AAAA-MM-JJ, heure de Paris'
          )
          .setRequired(true)
      )
      .addBooleanOption(option =>
        option
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
      .addChannelOption(option =>
        option
          .setName('salon')
          .setDescription(
            'Facultatif : y publier le classement'
          )
          .addChannelTypes(0)
      )
      .addStringOption(option =>
        option
          .setName('langue')
          .setDescription('Langue du classement')
          .addChoices(
            {
              name: 'Français',
              value: 'fr',
            },
            {
              name: 'English',
              value: 'en',
            }
          )
      ),

    staffCommand(
      'penalty-export',
      'Exporter tous les scores en CSV, sans limite de participants'
    )
      .addStringOption(option =>
        option
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
    )
      .addStringOption(option =>
        option
          .setName('id')
          .setDescription(
            'ID du duel affiché en bas du message'
          )
          .setRequired(true)
      ),
  ].map(command => command.toJSON());
}

async function main() {
  for (const key of [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'DISCORD_GUILD_ID',
  ]) {
    if (!process.env[key]) {
      throw new Error(
        `Variable manquante : ${key}`
      );
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
    intents: [
      GatewayIntentBits.Guilds,
    ],

    allowedMentions: {
      parse: [],
    },
  });

  const queues = new Map();

  let boardsDirty = 1;
  let refreshing = false;
  let closing = false;

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
    const event = store.event();
    const game = event.games[id];

    if (!game) {
      throw new GameError('missing');
    }

    return game;
  };

  const publicDuel = id =>
    queue(id, async () => {
      const game = getGame(id);

      if (!game.message) return;

      try {
        const channel =
          await client.channels.fetch(
            game.channel
          );

        if (!channel?.isTextBased()) {
          return;
        }

        await channel.messages.edit(
          game.message,
          await gamePayload(game, game.lang)
        );
      } catch (error) {
        if (
          [10003, 10008].includes(error.code) &&
          ['invited', 'waiting', 'result'].includes(
            game.phase
          )
        ) {
          engine.end(id, '', true);
        } else {
          console.error(
            'Affichage duel :',
            error.code || error.name
          );
        }
      }
    });

  const refreshBoards = async () => {
    if (refreshing || !boardsDirty) {
      return;
    }

    refreshing = true;
    const version = boardsDirty;

    try {
      for (const board of store.event().boards) {
        try {
          const channel =
            await client.channels.fetch(
              board.channel
            );

          await channel.messages.edit(
            board.message,
            leaderboardPayload(
              engine,
              board.lang
            )
          );
        } catch (error) {
          if (
            [10003, 10008].includes(error.code)
          ) {
            store.change((state, event) => {
              event.boards =
                event.boards.filter(
                  item =>
                    item.message !==
                    board.message
                );
            });
          } else {
            console.error(
              'Classement :',
              error.code || error.name
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

  const isStaff = interaction =>
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    ) ||
    (
      process.env.ADMIN_ROLE_ID &&
      interaction.member?.roles?.cache?.has(
        process.env.ADMIN_ROLE_ID
      )
    ) ||
    (
      process.env.ADMIN_ROLE_ID &&
      Array.isArray(
        interaction.member?.roles
      ) &&
      interaction.member.roles.includes(
        process.env.ADMIN_ROLE_ID
      )
    );

  async function onCommand(interaction) {
    if (!isStaff(interaction)) {
      throw new GameError('staff');
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    if (
      interaction.commandName ===
      'penalty-installer'
    ) {
      const channel =
        interaction.options.getChannel(
          'salon',
          true
        );

      const lang =
        interaction.options.getString(
          'langue',
          true
        );

      const image =
        interaction.options.getString(
          'image'
        );

      if (
        image &&
        !/^https:\/\/\S+$/i.test(image)
      ) {
        return interaction.editReply(
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

      const message =
        await channel.send(payload);

      store.change((state, event) => {
        event.panels.push({
          channel: channel.id,
          message: message.id,
          lang,
        });
      });

      return interaction.editReply(
        `Menu installé dans <#${channel.id}>. ` +
        'Les menus français et anglais partagent le même classement.'
      );
    }

    if (
      interaction.commandName ===
      'penalty-evenement'
    ) {
      if (
        !interaction.options.getBoolean(
          'confirmer',
          true
        )
      ) {
        return interaction.editReply(
          'Aucun changement. Mets confirmer sur Oui pour créer une nouvelle édition.'
        );
      }

      const event = createEvent(
        interaction.options.getString(
          'titre',
          true
        ),

        interaction.options.getString(
          'debut',
          true
        ),

        interaction.options.getString(
          'fin',
          true
        )
      );

      const previous = store.event();

      for (
        const game of Object.values(
          previous.games
        )
      ) {
        if (
          game.type === 'duel' &&
          ['invited', 'waiting', 'result'].includes(
            game.phase
          )
        ) {
          engine.end(game.id, '', true);
          await publicDuel(game.id);
        }
      }

      store.change(state => {
        state.events[event.id] = event;
        state.current = event.id;
      });

      boardsDirty++;

      return interaction.editReply(
        `Nouvelle édition : **${clean(
          event.title
        )}**, du ${event.start} au ${event.end}, ` +
        'jours inclus (heure de Paris).\n' +
        'L’ancien classement est archivé. ' +
        'Réinstalle les menus FR/EN et le classement avec les commandes habituelles.\n' +
        `ID de l’édition : \`${event.id}\``
      );
    }

    if (
      interaction.commandName ===
      'penalty-classement'
    ) {
      const lang =
        interaction.options.getString(
          'langue'
        ) || 'fr';

      const channel =
        interaction.options.getChannel(
          'salon'
        );

      if (!channel) {
        return interaction.editReply(
          leaderboardPayload(engine, lang)
        );
      }

      const message = await channel.send(
        leaderboardPayload(engine, lang)
      );

      store.change((state, event) => {
        event.boards.push({
          channel: channel.id,
          message: message.id,
          lang,
        });
      });

      return interaction.editReply(
        `Classement publié dans <#${channel.id}>. ` +
        'Ce message sera actualisé après les séries terminées, sous 15 secondes.'
      );
    }

    if (
      interaction.commandName ===
      'penalty-export'
    ) {
      const state = store.read();

      const edition =
        interaction.options.getString(
          'edition'
        ) || state.current;

      const event = state.events[edition];

      if (!event) {
        return interaction.editReply(
          'Édition introuvable. Regarde /penalty-diagnostic pour les identifiants.'
        );
      }

      const csvCell = value =>
        `"${
          String(value)
            .replace(/^[=+\-@]/, "'$&")
            .replace(/"/g, '""')
        }"`;

      const rows = [
        [
          'rang',
          'discord_id',
          'pseudo',
          'points',
          'series_terminees',
          'meilleure_serie',
        ],

        ...engine.rankings(event).map(
          user => [
            user.rank,
            user.id,
            user.name,
            user.points,
            user.days,
            user.best,
          ]
        ),
      ];

      const csv =
        '\uFEFF' +
        rows
          .map(row =>
            row.map(csvCell).join(';')
          )
          .join('\r\n');

      return interaction.editReply({
        content:
          'Tous les scores de cette édition. ' +
          'Aucun transfert automatique vers le bot des pronos.',

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
      interaction.commandName ===
      'penalty-diagnostic'
    ) {
      const state = store.read();
      const event = store.event();

      const activeDuels =
        Object.values(event.games).filter(
          game =>
            game.type === 'duel' &&
            [
              'invited',
              'waiting',
              'result',
            ].includes(game.phase)
        ).length;

      const editions =
        Object.values(state.events)
          .slice(-20)
          .map(
            item =>
              `\`${item.id}\` · ` +
              `${clean(item.title)} ` +
              `(${item.start} → ${item.end})`
          )
          .join('\n');

      return interaction.editReply({
        embeds: [
          baseEmbed()
            .setTitle('Diagnostic')
            .setDescription(
              `Édition : **${clean(
                event.title
              )}**\n` +
              `Dates : ${event.start} → ${event.end}\n` +
              `Aujourd’hui à Paris : ${dayInParis()}\n` +
              `Joueurs classés : ${engine.rankings().length}\n` +
              `Duels actifs : ${activeDuels}\n` +
              `Stockage : \`${clean(
                store.file
              )}\`\n` +
              'Volume Railway détecté : ' +
              (
                process.env.RAILWAY_VOLUME_MOUNT_PATH
                  ? 'oui'
                  : 'non / environnement local'
              ) +
              '\n\nÉditions archivées et actuelle :\n' +
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
      interaction.commandName ===
      'penalty-fermer-duel'
    ) {
      const game = engine.end(
        interaction.options.getString(
          'id',
          true
        ),
        interaction.user.id,
        true
      );

      await publicDuel(game.id);

      return interaction.editReply(
        'Duel fermé. Aucun point n’a été modifié.'
      );
    }
  }

  async function onComponent(interaction) {
    const parts =
      interaction.customId.split(':');

    const kind = parts[0];

    const lang =
      parts.at(-1) === 'en'
        ? 'en'
        : 'fr';

    const text = T[lang];

    if (kind === 'p') {
      const [, eventId, action] = parts;
      const event = store.event();

      if (event.id !== eventId) {
        throw new GameError('oldEvent');
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (
        action === 'daily' ||
        action === 'training'
      ) {
        const game = engine.solo(
          interaction.user.id,

          interaction.member?.displayName ||
          interaction.user.globalName ||
          interaction.user.username,

          action === 'training'
        );

        return interaction.editReply(
          await gamePayload(game, lang)
        );
      }

      if (action === 'rules') {
        return interaction.editReply({
          embeds: [
            baseEmbed()
              .setTitle(
                `📖 ${text.rules}`
              )
              .setDescription(
                text.rulesText
              ),
          ],
        });
      }

      if (action === 'ranking') {
        return interaction.editReply(
          leaderboardPayload(
            engine,
            lang,
            interaction.user.id
          )
        );
      }

      if (action === 'profile') {
        const own =
          engine.rankings().find(
            user =>
              user.id === interaction.user.id
          );

        const today =
          Object.values(event.games).find(
            game =>
              game.type === 'solo' &&
              game.users[0] ===
                interaction.user.id &&
              game.day === dayInParis()
          );

        return interaction.editReply({
          embeds: [
            baseEmbed()
              .setTitle(
                `📊 ${text.profile}`
              )
              .setDescription(
                (
                  lang === 'en'
                    ? '**Event points**'
                    : '**Points de l’événement**'
                ) +
                ` : ${own?.points || 0}\n\n` +
                `🏆 ${
                  own
                    ? `#${own.rank}`
                    : text.noRank
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
        engine.active(event);

        return interaction.editReply({
          content: text.pickOpponent,

          components: [
            new ActionRowBuilder()
              .addComponents(
                new UserSelectMenuBuilder()
                  .setCustomId(
                    `u:${event.id}:${lang}`
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
      await interaction.deferUpdate();

      const game =
        kind === 's'
          ? engine.shoot(
              parts[1],
              interaction.user.id,
              Number(parts[2]),
              Number(parts[3])
            )
          : engine.next(
              parts[1],
              interaction.user.id,
              Number(parts[2])
            );

      if (kind === 's') {
        if (
          game.type === 'solo' &&
          game.phase === 'finished'
        ) {
          boardsDirty++;
        }

        try {
          await interaction.editReply(
            await gamePayload(
              game,
              lang,
              true
            )
          );

          await sleep(650);
        } catch (error) {
          console.error(
            'Transition visuelle :',
            error.code || error.name
          );
        }
      }

      return interaction.editReply(
        await gamePayload(game, lang)
      );
    }

    if (kind === 'u') {
      await interaction.deferUpdate();

      if (
        parts[1] !== store.event().id
      ) {
        throw new GameError('oldEvent');
      }

      const target =
        await interaction.guild.members.fetch(
          interaction.values[0]
        );

      if (target.user.bot) {
        throw new GameError('bot');
      }

      const game = engine.challenge(
        interaction.user.id,

        interaction.member.displayName ||
        interaction.user.username,

        target.id,
        target.displayName,
        interaction.channelId,
        lang
      );

      try {
        const payload =
          await gamePayload(game, lang);

        const message =
          await interaction.channel.send({
            ...payload,

            content: `<@${target.id}>`,

            allowedMentions: {
              users: [target.id],
            },
          });

        store.change((state, event) => {
          event.games[game.id].message =
            message.id;
        });

        return interaction.editReply({
          content: text.invitationSent,
          embeds: [],
          components: [],
        });
      } catch (error) {
        engine.end(game.id, '', true);
        throw error;
      }
    }

    if (kind === 'd') {
      const [
        ,
        id,
        action,
        turnString,
      ] = parts;

      const game = getGame(id);
      const turn = Number(turnString);

      if (
        !game.users.includes(
          interaction.user.id
        )
      ) {
        throw new GameError('owner');
      }

      if (action === 'accept') {
        await interaction.deferUpdate();

        engine.accept(
          id,
          interaction.user.id
        );

        return publicDuel(id);
      }

      if (action === 'next') {
        await interaction.deferUpdate();

        engine.next(
          id,
          interaction.user.id,
          turn
        );

        return publicDuel(id);
      }

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (action === 'leave') {
        return interaction.editReply({
          content: text.exitQuestion,

          components: [
            row(
              button(
                `q:${id}:${lang}`,
                text.confirm,
                ButtonStyle.Danger
              ),

              button(
                `x:${id}:${lang}`,
                text.cancel,
                ButtonStyle.Secondary
              )
            ),
          ],
        });
      }

      engine.active(store.event());

      if (
        game.phase !== 'waiting' ||
        game.shots.length !== turn
      ) {
        throw new GameError('stale');
      }

      if (
        game.expires < Date.now()
      ) {
        throw new GameError('expired');
      }

      if (
        !['shot', 'dive'].includes(action)
      ) {
        throw new GameError('invalid');
      }

      const playerIndex =
        action === 'shot'
          ? turn % 2
          : 1 - (turn % 2);

      if (
        game.users[playerIndex] !==
        interaction.user.id
      ) {
        throw new GameError('owner');
      }

      if (
        game.pending[action] !== undefined
      ) {
        throw new GameError('locked');
      }

      return interaction.editReply({
        content:
          `${
            action === 'shot'
              ? '⚽'
              : '🧤'
          } **${
            action === 'shot'
              ? text.shoot
              : text.dive
          }**\n\n` +
          text.privateHint,

        components: [
          directions(
            `c:${id}:${turn}:${action}`,
            lang
          ),
        ],
      });
    }

    if (kind === 'c') {
      await interaction.deferUpdate();

      engine.choose(
        parts[1],
        interaction.user.id,
        Number(parts[2]),
        parts[3],
        Number(parts[4])
      );

      await interaction.editReply({
        content: text.lockedChoice,
        embeds: [],
        components: [],
      });

      return publicDuel(parts[1]);
    }

    if (kind === 'q') {
      await interaction.deferUpdate();

      engine.end(
        parts[1],
        interaction.user.id
      );

      await interaction.editReply({
        content: text.closed,
        components: [],
      });

      return publicDuel(parts[1]);
    }

    if (kind === 'x') {
      await interaction.deferUpdate();

      return interaction.editReply({
        content:
          lang === 'en'
            ? 'Back to the duel message to keep playing.'
            : 'Retourne au message du duel pour continuer.',

        components: [],
      });
    }

    throw new GameError('invalid');
  }

  client.on(
    Events.InteractionCreate,
    async interaction => {
      if (
        interaction.guildId !==
          process.env.DISCORD_GUILD_ID ||
        (
          !interaction.isChatInputCommand() &&
          !interaction.isButton() &&
          !interaction.isUserSelectMenu()
        )
      ) {
        return;
      }

      try {
        if (
          interaction.isChatInputCommand()
        ) {
          await onCommand(interaction);
        } else {
          await onComponent(interaction);
        }
      } catch (error) {
        const lang =
          interaction.customId?.endsWith(
            ':en'
          )
            ? 'en'
            : 'fr';

        let content;

        if (
          error instanceof GameError &&
          error.message === 'cooldown'
        ) {
          content =
            lang === 'en'
              ? 'Please wait 30 seconds between invitations.'
              : 'Attends 30 secondes entre deux invitations.';
        } else {
          const key =
            error instanceof GameError
              ? error.message
              : 'general';

          content =
            T[lang].errors[key] ||
            T[lang].errors.general;
        }

        if (
          !(error instanceof GameError)
        ) {
          console.error(
            'Interaction :',
            error.code || error.name,

            error.message?.replace(
              /https:\/\/\S+/g,
              '[URL]'
            )
          );
        }

        try {
          if (
            interaction.replied ||
            interaction.deferred
          ) {
            await interaction.followUp({
              content,
              flags:
                MessageFlags.Ephemeral,
            });
          } else {
            await interaction.reply({
              content,
              flags:
                MessageFlags.Ephemeral,
            });
          }
        } catch {
          // La partie a déjà été sauvegardée.
        }
      }
    }
  );

  client.once(
    Events.ClientReady,
    async () => {
      console.log(
        `Connecté : ${client.user.tag}. ` +
        `Édition ${store.event().id}. ` +
        'Stockage SQLite actif.'
      );

      try {
        for (
          const game of engine.expire()
        ) {
          await publicDuel(game.id);
        }

        for (
          const game of Object.values(
            store.event().games
          )
        ) {
          if (
            game.type === 'duel' &&
            [
              'invited',
              'waiting',
              'result',
            ].includes(game.phase)
          ) {
            await publicDuel(game.id);
          }
        }

        await refreshBoards();
      } catch (error) {
        console.error(
          'Reprise :',
          error.code || error.name
        );
      }
    }
  );

  client.on(
    Events.Error,
    error => {
      console.error(
        'Discord :',
        error.code || error.name
      );
    }
  );

  const tick = setInterval(
    async () => {
      if (closing) return;

      try {
        for (
          const game of engine.expire()
        ) {
          await publicDuel(game.id);
        }

        await refreshBoards();
      } catch (error) {
        console.error(
          'Entretien :',
          error.code || error.name
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
      {
        body: commands(),
      }
    );

  await client.login(
    process.env.DISCORD_TOKEN
  );

  const shutdown = async () => {
    if (closing) return;

    closing = true;
    clearInterval(tick);
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
  main().catch(error => {
    console.error(
      'Démarrage :',
      error.message?.replace(
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
};
