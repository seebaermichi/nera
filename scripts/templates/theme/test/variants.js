// The fixture variants the global setup builds, and the token values the
// overrides variant sets, which the tests read back.
import { writeFiles } from '@nera-static/test-utils'

export const OVERRIDE = { token: 'color.accent', value: '#006400' }

// A site token the theme does not define, with a value that would close the rule.
export const INJECTED = { token: 'color.injected', value: 'red}body{display:none' }

export const VARIANTS = {
    default: null,
    overrides: (site) => writeFiles(site, {
        'config/theme.yaml': [
            'tokens:',
            '    color:',
            `        accent: '${OVERRIDE.value}'`,
            `        injected: '${INJECTED.value}'`,
            '',
        ].join('\n'),
    }),
}
