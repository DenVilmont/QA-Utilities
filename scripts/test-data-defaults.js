// Test data shown at the bottom of the "Utilities" tab until the user changes it in the settings page.
// Model: group -> sections (a section without a name has no header) -> values (label is optional).
// Invisible characters are written as \uXXXX so they can be seen in the code.

export const DEFAULT_TEST_DATA_GROUPS = [
  {
    name: 'Unicode',
    sections: [
      {
        name: '',
        values: [
          {label: 'Mixed symbols', value: 'latín - Quis custodiet ipsos custodes?\ncirílico - кириллица.\ngriego - Ελληνικό δείγμα κειμένου.\nárabe - هذا نص عربي للتجربة.\nhebreo - טקסט לדוגמה בעברית.\ndevanagari - यह हिंदी परीक्षण वाक्य है।\nbengalí - এটি বাংলা পরীক্ষার বাক্য।\ntamil - இது தமிழ் சோதனை உரை.\ntailandés - นี่คือข้อความทดสอบภาษาไทย\ngeorgiano - ეს ქართული სატესტო ტექსტია.\narmenio - Սա հայերեն փորձնական տեքստ է։\nchino (hanzi) - 这是一个中文测试字符串。\njaponés (kanji/kana) - 日本語のテスト文字列です。\ncoreano (hangul) - 이것은 한국어 테스트 문장입니다।\netíope (geʽez) - ይህ የፈተና ጽሑፍ ነው።\nmezclado raro - lоrеm ipsμm τεst 漢字 عربى кириллица I❤︎code; café №1; naïve coöperate; Göteborg; π≈3.14159\nancho completo - Ｆｕｌｌｗｉｄｔｈ １２３４５\ndiacríticos combinantes - á é í ó ú ñ\ncomillas tipográficas - “dobles” ‘simples’ «angulares» „alemanas“\nguiones y rayas - - – — ‒ −\nflechas - → ← ↑ ↓ ⇒ ⇐ ⇑ ⇓\nsímbolos matemáticos - ℝ ℕ ℤ ℚ ℂ ∑ ∏ ∞ ≈ ≠ ≤ ≥ ± √ ∫ ∇\ndibujo de cajas -\n┌─┬─┐\n│ │ │\n└─┴─┘\nbraille - ⠋⠗⠁⠊⠇⠇⠑\nemoji - 🍣 🧪 🐍 ⚙️ 🚀 🔒 🧠 🤖 🧩\nespacios invisibles - A\u200BB · A\u2060B · A\u00A0B'},
          {label: 'Mixed scripts 1', value: 'lоrеm ipsμm τεst 漢字 عربى кириллица'},
          {label: 'Mixed scripts 2', value: 'I❤︎code — café №1; naïve coöperate; Göteborg; π≈3.14159'},
          {label: 'Bidi/RTL', value: 'abc\u202Etxt.exe\u202C'},
          {label: 'Zero width mix', value: 'A\u200B\u200C\u200D\u2060B'}
        ]
      }
    ]
  },
  {
    name: 'Nombres',
    sections: [
      {
        name: 'Nombres',
        values: [
          {value: 'María'},
          {value: 'Lucía'},
          {value: 'Sofía'},
          {value: 'Martina'},
          {value: 'Hugo'},
          {value: 'Mateo'},
          {value: 'Pablo'},
          {value: 'Lucas'},
          {value: 'Daniel'},
          {value: 'Alejandro'},
          {value: 'Íker'},
          {value: 'Noa'},
          {value: 'Diego'},
          {value: 'Álvaro'},
          {value: 'Nicolás'}
        ]
      },
      {
        name: 'Apellidos',
        values: [
          {value: 'García'},
          {value: 'Martínez'},
          {value: 'López'},
          {value: 'Sánchez'},
          {value: 'Pérez'},
          {value: 'Gómez'},
          {value: 'Fernández'},
          {value: 'Díaz'},
          {value: 'Álvarez'},
          {value: 'Torres'},
          {value: 'Navarro'},
          {value: 'Vázquez'},
          {value: 'Romero'},
          {value: 'Suárez'}
        ]
      },
      {
        name: 'Nombres completos',
        values: [
          {value: 'María García'},
          {value: 'Lucía Martínez'},
          {value: 'Sofía López'},
          {value: 'Martina Sánchez'},
          {value: 'Hugo Pérez'},
          {value: 'Mateo Gómez'},
          {value: 'Pablo Fernández'},
          {value: 'Lucas Díaz'},
          {value: 'Daniel Álvarez'},
          {value: 'Alejandro Torres'},
          {value: 'Íker Navarro'},
          {value: 'Noa Vázquez'},
          {value: 'Diego Romero'},
          {value: 'Álvaro Suárez'}
        ]
      }
    ]
  },
  {
    name: 'Emails',
    sections: [
      {
        name: 'Valid (common)',
        values: [
          {label: 'simple', value: 'user@example.com'},
          {label: 'subdomain', value: 'user@mail.example.co.uk'},
          {label: 'plus-tag', value: 'user+tag@example.com'},
          {label: 'dot.local', value: 'first.last@example.com'},
          {label: 'numeric', value: 'u12345@example.com'},
          {label: 'quoted', value: '"quoted"@example.com'}
        ]
      },
      {
        name: 'Valid (edge RFC)',
        values: [
          {label: 'domain-literal', value: 'user@[192.168.0.1]'},
          {label: 'idn-unicode', value: 'почта@пример.рф'},
          {label: 'unicode-local', value: 'δοκιμή@παράδειγμα.δοκιμή'}
        ]
      },
      {
        name: 'Invalid',
        values: [
          {label: 'no-at', value: 'user.example.com'},
          {label: 'two-ats', value: 'user@@example.com'},
          {label: 'bad-domain', value: 'user@example..com'},
          {label: 'space', value: 'user name@example.com'},
          {label: 'ending-dot', value: 'user@example.com.'},
          {label: 'no-tld', value: 'user@localhost'},
          {label: 'leading-dot-local', value: '.user@example.com'}
        ]
      }
    ]
  },
  {
    name: 'Numbers',
    sections: [
      {
        name: 'Integers',
        values: [
          {value: '0'},
          {value: '1'},
          {value: '-1'},
          {value: '000'},
          {value: '000123'},
          {value: '2147483647'},
          {value: '-2147483648'},
          {value: '9223372036854775807'},
          {value: '-9223372036854775808'},
          {value: '999999999999999999999999'}
        ]
      },
      {
        name: 'Floats & Sci',
        values: [
          {value: '0.0'},
          {value: '-0.0'},
          {value: '3.14159'},
          {value: '.5'},
          {value: '1.'},
          {value: '1e3'},
          {value: '-2.5e-8'},
          {value: '6.022e23'},
          {value: 'NaN'},
          {value: 'Infinity'},
          {value: '-Infinity'}
        ]
      },
      {
        name: 'Localized/Formatted',
        values: [
          {label: 'US thousands', value: '1,234'},
          {label: 'US money', value: '1,234.56'},
          {label: 'EU money', value: '1.234,56'},
          {label: 'Space group', value: '12 345 678'},
          {label: 'Thin space', value: '12\u2009345\u2009678'},
          {label: 'Comma decimal', value: '1,23'},
          {label: 'Arabic-Indic', value: '١٢٣٤٥'},
          {label: 'Fullwidth', value: '１２３４'},
          {label: 'Unicode minus', value: '−42'}
        ]
      },
      {
        name: 'Radices',
        values: [
          {value: '0xFF'},
          {value: '0xff'},
          {value: '0b1010'},
          {value: '0o755'},
          {value: '0755'},
          {value: '∞'}
        ]
      }
    ]
  },
  {
    name: 'URLs',
    sections: [
      {
        name: 'Valid',
        values: [
          {value: 'http://example.com'},
          {value: 'https://example.com/path?q=a#frag'},
          {value: 'https://sub.example.co.uk:8443/'},
          {value: 'ftp://ftp.example.com/file.txt'},
          {value: 'mailto:user@example.com'},
          {value: 'data:text/plain;base64,SGVsbG8='}
        ]
      },
      {
        name: 'Invalid',
        values: [
          {value: 'http:///example.com'},
          {value: '://missing.scheme.com'},
          {value: 'http://'},
          {value: 'http://exa mple.com'},
          {value: 'http://example..com'},
          {value: 'htp://bad'}
        ]
      }
    ]
  },
  {
    name: 'Phones',
    sections: [
      {
        name: '',
        values: [
          {label: 'E.164 ES', value: '+34600123456'},
          {label: 'E.164 US', value: '+16502530000'},
          {label: 'National ES', value: '600 12 34 56'},
          {label: 'US formatted', value: '(650) 253-0000'},
          {label: 'Intl spaces', value: '+44 20 7946 0958'},
          {label: 'With dots', value: '202.555.0143'},
          {label: 'Invalid short', value: '123'},
          {label: 'Invalid letters', value: '12AB-34CD'}
        ]
      }
    ]
  },
  {
    name: 'Dates',
    sections: [
      {
        name: '',
        values: [
          {label: 'ISO date', value: '2025-09-08'},
          {label: 'ISO datetime Z', value: '2025-09-08T12:34:56Z'},
          {label: 'ISO with offset', value: '2025-09-08T12:34:56+02:00'},
          {label: 'EU format', value: '31/12/2025'},
          {label: 'US format', value: '12/31/2025'},
          {label: 'Valid leap', value: '2000-02-29'},
          {label: 'Invalid leap', value: '2025-02-29'},
          {label: 'Bad month', value: '2025-13-01'},
          {label: 'Bad day', value: '2025-04-31'}
        ]
      }
    ]
  },
  {
    name: 'Addresses',
    sections: [
      {
        name: '',
        values: [
          {value: 'Calle de Alcalá, 123, 28009 Madrid, España'},
          {value: 'Pl. Catalunya, 1, 08002 Barcelona, España'},
          {value: 'Av. de la Constitución, 45, 41001 Sevilla, España'},
          {value: '10 Downing St, London SW1A 2AA, UK'},
          {value: '221B Baker St, London NW1 6XE, UK'},
          {value: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA'},
          {value: 'One Apple Park Way, Cupertino, CA 95014, USA'},
          {value: '1 Infinite Loop, Cupertino, CA 95014, USA'},
          {value: 'P.O. Box 123, Metropolis, NY 10001, USA'},
          {value: 'Bahnhofstrasse 1, 8001 Zürich, Schweiz'},
          {value: 'Unter den Linden 77, 10117 Berlin, Deutschland'},
          {value: 'ул. Тверская, д. 1, Москва, 125009, Россия'},
          {value: '〒150-0001 東京都渋谷区神宮前1-1-1, 日本'},
          {value: '北京市朝阳区建国门外大街1号, 中国'},
          {value: 'Av. Paulista, 1578, São Paulo - SP, 01310-200, Brasil'}
        ]
      }
    ]
  },
  {
    name: 'Whitespace',
    sections: [
      {
        name: '',
        values: [
          {value: ' '},
          {value: '\t'},
          {value: '\n'},
          {value: '\r\n'},
          {value: '\u00A0'},
          {value: '\u200B'},
          {value: '\u2060'},
          {value: '\u2003'}
        ]
      }
    ]
  },
  {
    name: 'Exploits',
    sections: [
      {
        name: 'XSS',
        values: [
          {value: '<img src=x onerror=alert(1)>'},
          {value: '"><svg onload=alert(1)>'},
          {value: '"><script>alert(1)</script>'},
          {value: '<svg><a><animate onbegin=alert(1)></animate></a></svg>'},
          {value: '<body onfocus=alert(1) tabindex=1>'},
          {value: '<a href=javascript:alert(1)>click</a>'},
          {value: '<iframe srcdoc="<script>alert(1)</script>"></iframe>'},
          {value: '<input autofocus onfocus=alert(1)>'}
        ]
      },
      {
        name: 'SQLi',
        values: [
          {value: '\' OR 1=1 --'},
          {value: '\' OR \'1\'=\'1'},
          {value: '" OR "1"="1'},
          {value: 'admin\' --'},
          {value: '\' UNION SELECT NULL,NULL --'},
          {value: '1; DROP TABLE users; --'},
          {value: '\'; WAITFOR DELAY \'0:0:5\' --'},
          {value: '1\' AND SLEEP(5) --'}
        ]
      },
      {
        name: 'Path traversal',
        values: [
          {value: '../'},
          {value: '..\\'},
          {value: '%2e%2e%2f'},
          {value: '../../etc/passwd'},
          {value: '..\\..\\windows\\win.ini'},
          {value: '/../../../../etc/shadow'}
        ]
      },
      {
        name: 'Command injection',
        values: [
          {value: 'test; cat /etc/passwd'},
          {value: 'value && ping -c 1 127.0.0.1'},
          {value: 'a|whoami'},
          {value: '$(id)'},
          {value: '`id`'}
        ]
      },
      {
        name: 'Template injection',
        values: [
          {value: '{{7*7}}'},
          {value: '{{constructor.constructor(\'alert(1)\')()}}'},
          {value: '<%= 7*7 %>'},
          {value: '${{7*7}}'},
          {value: '${{config.items()}}'}
        ]
      },
      {
        name: 'LDAP injection',
        values: [
          {value: '*) (|(uid=*)) (| (uid=*))'},
          {value: '*) (|(mail=*))'},
          {value: '(uid=*)(!(uid=*))'}
        ]
      },
      {
        name: 'CRLF injection',
        values: [
          {value: '%0d%0aSet-Cookie:%20hack=1'},
          {value: '%0d%0aContent-Length:%200'}
        ]
      },
      {
        name: 'XXE',
        values: [
          {value: '<?xml version="1.0"?><!DOCTYPE a [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>'},
          {value: '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "http://127.0.0.1:80/xxe">]>'}
        ]
      },
      {
        name: 'SSRF',
        values: [
          {value: 'http://127.0.0.1:80'},
          {value: 'http://169.254.169.254/latest/meta-data/'},
          {value: 'file:///etc/hosts'},
          {value: 'gopher://127.0.0.1:11211/_stats'}
        ]
      },
      {
        name: 'Unicode confusables',
        values: [
          {label: 'dotless ı', value: 'paypaı.com'},
          {label: 'Cyrillic а', value: 'pаypal.com'},
          {value: 'admin\u200E'},
          {value: 'user\u200Fname'}
        ]
      }
    ]
  }
];
