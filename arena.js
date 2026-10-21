'use strict';

const sharp = require('sharp');

const esc = value =>
  String(value).replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[character]
  );

const xFor = direction =>
  [350, 600, 850][direction];

function ghost(x, y, color = '#FFFFFF') {
  return `
    <g transform="translate(${x},${y})">
      <ellipse
        cy="90"
        rx="85"
        ry="13"
        fill="#000"
        opacity=".3"
      />

      <path
        d="M-52 74V-16a52 52 0 0 1 104 0v90L26 54 0 77 -26 54Z"
        fill="${color}"
      />

      <ellipse
        cx="-18"
        cy="-12"
        rx="8"
        ry="13"
        fill="#081A32"
      />

      <ellipse
        cx="18"
        cy="-12"
        rx="8"
        ry="13"
        fill="#081A32"
      />

      <ellipse
        cy="20"
        rx="10"
        ry="13"
        fill="#081A32"
      />

      <path
        d="M-45 22 -83 5M45 22 83 5"
        stroke="${color}"
        stroke-width="17"
        stroke-linecap="round"
      />
    </g>
  `;
}

function ball(x, y, size = 22) {
  return `
    <g transform="translate(${x},${y})">
      <circle
        r="${size}"
        fill="#fff"
        stroke="#A7B3C2"
        stroke-width="2"
      />

      <path
        d="
          M0 -${size * 0.5}
          ${size * 0.5} -${size * 0.12}
          ${size * 0.32} ${size * 0.5}
          -${size * 0.32} ${size * 0.5}
          -${size * 0.5} -${size * 0.12}Z
        "
        fill="#081A32"
      />

      <path
        d="
          M0 -${size * 0.5} 0 -${size}
          M${size * 0.5} -${size * 0.12}
          ${size * 0.95} -${size * 0.3}
          M${size * 0.32} ${size * 0.5}
          ${size * 0.55} ${size * 0.84}
          M-${size * 0.32} ${size * 0.5}
          -${size * 0.55} ${size * 0.84}
          M-${size * 0.5} -${size * 0.12}
          -${size * 0.95} -${size * 0.3}
        "
        stroke="#081A32"
        stroke-width="3"
      />
    </g>
  `;
}

async function arena(
  game,
  lang = 'fr',
  mode = 'normal'
) {
  if (mode === 'run') {
    game = {
      ...game,
      phase: 'waiting',
      shots: game.shots.slice(0, -1),
    };
  }

  const en = lang === 'en';
  const last = game.shots.at(-1);

  const result =
    ['result', 'finished'].includes(game.phase) &&
    last &&
    mode !== 'run';

  const duel = game.type === 'duel';
  const finished = game.phase === 'finished';

  let headline =
    mode === 'run'
      ? en
        ? 'HERE COMES THE SHOT…'
        : 'LE TIREUR S’ÉLANCE…'
      : finished
        ? en
          ? 'FULL TIME'
          : 'FIN DE LA SÉRIE'
        : result
          ? last.goal
            ? en
              ? 'GOOOAL!'
              : 'BUUUUT !'
            : en
              ? 'SAVED!'
              : 'ARRÊT DU GARDIEN !'
          : en
            ? 'PICK YOUR CORNER'
            : 'CHOISIS TON CÔTÉ';

  if (
    ['invited', 'cancelled', 'expired'].includes(
      game.phase
    )
  ) {
    headline =
      game.phase === 'invited'
        ? en
          ? 'A DUEL AWAITS'
          : 'LE DUEL T’ATTEND'
        : en
          ? 'DUEL CLOSED'
          : 'DUEL TERMINÉ';
  }

  if (mode === 'cover') {
    headline = en
      ? 'THE KEEPER IS WAITING'
      : 'LE GARDIEN T’ATTEND';
  }

  const dots = (shots, x, y) =>
    Array.from(
      { length: 5 },
      (_, index) => `
        <circle
          cx="${x + index * 37}"
          cy="${y}"
          r="12"
          fill="${
            shots[index]
              ? shots[index].goal
                ? '#5BE9BB'
                : '#FF657D'
              : '#233B56'
          }"
        />

        ${
          shots[index]
            ? `
              <text
                x="${x + index * 37}"
                y="${y + 5}"
                text-anchor="middle"
                font-size="17"
                fill="#06172B"
              >${shots[index].goal ? '✓' : '×'}</text>
            `
            : ''
        }
      `
    ).join('');

  const scores = game.users.map(
    (_, index) =>
      game.shots.filter(
        shot =>
          (!duel || shot.shooter === index) &&
          shot.goal
      ).length
  );

  const name = (value, max = 22) =>
    esc(
      value.length > max
        ? value.slice(0, max - 1) + '…'
        : value
    );

  const status =
    mode === 'cover'
      ? en
        ? 'HALLOWEEN • THE SUPPORTERS’ CHALLENGE'
        : 'HALLOWEEN • LE DÉFI DES SUPPORTERS'
      : duel
        ? `${
            en ? 'PENALTY' : 'TIR'
          } ${Math.min(
            game.shots.length + (result ? 0 : 1),
            10
          )}/10  •  ${
            en ? 'FRIENDLY DUEL' : 'DUEL AMICAL'
          }`
        : `${
            en ? 'PENALTY' : 'TIR'
          } ${Math.min(
            game.shots.length + (result ? 0 : 1),
            5
          )}/5  •  ${
            game.type === 'training'
              ? en
                ? 'TRAINING'
                : 'ENTRAÎNEMENT'
              : en
                ? 'DAILY CHALLENGE'
                : 'DÉFI DU JOUR'
          }`;

  const accent = result
    ? last.goal
      ? '#5BE9BB'
      : '#FF657D'
    : '#FFAF67';

  let nets = '';

  for (let x = 225; x <= 975; x += 30) {
    nets += `
      <path
        d="M${x} 250V465"
        stroke="#739AB7"
        stroke-opacity=".25"
      />
    `;
  }

  for (let y = 250; y <= 465; y += 24) {
    nets += `
      <path
        d="M225 ${y}H975"
        stroke="#739AB7"
        stroke-opacity=".25"
      />
    `;
  }

  const labels = en
    ? ['LEFT', 'CENTRE', 'RIGHT']
    : ['GAUCHE', 'CENTRE', 'DROITE'];

  const zones = labels
    .map(
      (label, direction) => `
        <g>
          <rect
            x="${xFor(direction) - 103}"
            y="276"
            width="206"
            height="160"
            rx="14"
            fill="${
              result && last.shot === direction
                ? accent
                : '#1A5475'
            }"
            fill-opacity="${
              result && last.shot === direction
                ? '.23'
                : '.18'
            }"
            stroke="${
              result && last.shot === direction
                ? accent
                : '#537C99'
            }"
            stroke-opacity=".7"
            stroke-dasharray="8 8"
          />

          <text
            x="${xFor(direction)}"
            y="458"
            text-anchor="middle"
            fill="#B4CCDC"
            font-size="14"
            letter-spacing="3"
          >${label}</text>
        </g>
      `
    )
    .join('');

  let footer;

  if (mode === 'cover') {
    footer = `
      <text
        x="80"
        y="605"
        fill="#FFF"
        font-size="26"
        font-weight="800"
      >${
        en
          ? '5 SHOTS. YOUR TURN.'
          : '5 TIRS. À TOI DE JOUER.'
      }</text>

      <text
        x="80"
        y="635"
        fill="#9CB9CF"
        font-size="17"
      >${
        en
          ? 'One goal. One point.'
          : 'Un but. Un point.'
      }</text>

      <text
        x="1120"
        y="618"
        text-anchor="end"
        fill="#FFAF67"
        font-size="21"
        font-weight="800"
      >${
        en
          ? 'COME BACK EVERY DAY'
          : 'REVIENS CHAQUE JOUR'
      }</text>
    `;
  } else if (duel) {
    footer = `
      <text
        x="70"
        y="595"
        fill="#C8D8E7"
        font-size="18"
      >${name(game.names[0], 25)}</text>

      ${dots(
        game.shots.filter(
          shot => shot.shooter === 0
        ),
        82,
        626
      )}

      <text
        x="1130"
        y="595"
        text-anchor="end"
        fill="#C8D8E7"
        font-size="18"
      >${name(game.names[1], 25)}</text>

      ${dots(
        game.shots.filter(
          shot => shot.shooter === 1
        ),
        970,
        626
      )}

      <text
        x="600"
        y="622"
        text-anchor="middle"
        fill="#FFFFFF"
        font-size="45"
        font-weight="800"
      >${scores[0]} : ${scores[1]}</text>
    `;
  } else {
    footer = `
      <text
        x="70"
        y="600"
        fill="#C8D8E7"
        font-size="19"
      >${name(game.names[0], 30)}</text>

      ${dots(game.shots, 84, 630)}

      <text
        x="1130"
        y="602"
        text-anchor="end"
        fill="#FFF"
        font-weight="800"
        font-size="40"
      >${scores[0]} / 5</text>

      <text
        x="1130"
        y="630"
        text-anchor="end"
        fill="#A0B9D0"
        font-size="16"
      >${en ? 'GOALS' : 'BUTS'}</text>
    `;
  }

  const svg = `
    <svg
      width="1200"
      height="675"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="bg" x2="0" y2="1">
          <stop stop-color="#102F50"/>
          <stop offset="1" stop-color="#030D1D"/>
        </linearGradient>

        <linearGradient id="pitch" x2="0" y2="1">
          <stop stop-color="#0A3342"/>
          <stop offset="1" stop-color="#061724"/>
        </linearGradient>

        <radialGradient id="glow">
          <stop
            stop-color="#43A9DF"
            stop-opacity=".32"
          />
          <stop
            offset="1"
            stop-color="#43A9DF"
            stop-opacity="0"
          />
        </radialGradient>
      </defs>

      <rect
        width="1200"
        height="675"
        fill="url(#bg)"
      />

      <ellipse
        cx="600"
        cy="240"
        rx="650"
        ry="300"
        fill="url(#glow)"
      />

      <path
        d="M28 0H35V675H28Z"
        fill="#E92647"
      />

      <path
        d="M1165 0H1172V675H1165Z"
        fill="#E92647"
      />

      <g font-family="Arial,Helvetica,sans-serif">
        <text
          x="70"
          y="54"
          fill="#FFF"
          font-size="21"
          font-weight="800"
          letter-spacing="6"
        >PARIS</text>

        <text
          x="1130"
          y="54"
          text-anchor="end"
          fill="#FFAF67"
          font-size="16"
          font-weight="700"
          letter-spacing="3"
        >${
          en
            ? 'PENALTIES OF FEAR'
            : 'LES PÉNALTYS DE LA PEUR'
        }</text>

        <path
          d="M70 77H1130"
          stroke="#34506D"
        />

        <text
          x="600"
          y="117"
          fill="#A0B9D0"
          text-anchor="middle"
          font-size="16"
          letter-spacing="3"
        >${status}</text>

        <text
          x="600"
          y="177"
          fill="${accent}"
          text-anchor="middle"
          font-size="39"
          font-weight="900"
        >${headline}</text>

        <g opacity=".4">
          <path
            d="M105 225 335 420 0 420Z"
            fill="#A6D7FF"
            fill-opacity=".13"
          />

          <path
            d="M1095 225 865 420 1200 420Z"
            fill="#A6D7FF"
            fill-opacity=".13"
          />
        </g>

        <path
          d="M0 452H1200V555H0Z"
          fill="url(#pitch)"
        />

        <ellipse
          cx="600"
          cy="570"
          rx="360"
          ry="81"
          fill="none"
          stroke="#6FA3AE"
          stroke-opacity=".22"
          stroke-width="2"
        />

        ${nets}
        ${zones}

        <path
          d="M220 468V244H980V468"
          stroke="#D7EAF6"
          stroke-width="10"
          fill="none"
          stroke-linejoin="round"
        />

        <path
          d="M225 250H975V465H225Z"
          fill="none"
          stroke="#365A72"
          stroke-width="2"
        />

        ${ghost(
          result ? xFor(last.dive) : 600,
          result ? 350 : 352
        )}

        ${ball(
          result ? xFor(last.shot) : 600,
          result
            ? last.goal
              ? 290
              : 390
            : mode === 'run'
              ? 460
              : 513,
          result ? 17 : 22
        )}

        <rect
          x="50"
          y="565"
          width="1100"
          height="92"
          rx="18"
          fill="#081B30"
          stroke="#233F59"
        />

        ${footer}
      </g>
    </svg>
  `;

  return sharp(Buffer.from(svg))
    .png()
    .toBuffer();
}

module.exports = { arena };
