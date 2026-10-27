/* wp-ja-kinetic/mega-menu — the editor side, plain script against the wp.* globals: no JSX, no
 * build. The block's metadata (title, attributes, supports) comes from block.json through the
 * server registration; this file only says how it edits and what it saves. In the editor the
 * panel is always open and sits in the flow (`tracy-mega--editing`), so its columns can be
 * edited like any other inner blocks; the trigger label is edited in place. */
;((wp) => {
  const el = wp.element.createElement
  const { registerBlockType } = wp.blocks
  const { InnerBlocks, RichText, useBlockProps } = wp.blockEditor
  const { __ } = wp.i18n

  const TEMPLATE = [
    [
      'core/columns',
      { className: 'tracy-mega__columns' },
      [
        [
          'core/column',
          {},
          [
            [
              'core/heading',
              { level: 3, className: 'tracy-mega__title', placeholder: __('Column title', 'wp-ja-kinetic') }
            ],
            ['core/list', { className: 'tracy-mega__links' }, [['core/list-item', {}]]]
          ]
        ],
        [
          'core/column',
          {},
          [
            [
              'core/heading',
              { level: 3, className: 'tracy-mega__title', placeholder: __('Column title', 'wp-ja-kinetic') }
            ],
            ['core/list', { className: 'tracy-mega__links' }, [['core/list-item', {}]]]
          ]
        ]
      ]
    ]
  ]

  registerBlockType('wp-ja-kinetic/mega-menu', {
    edit: (props) => {
      const blockProps = useBlockProps({ className: 'tracy-mega tracy-mega--editing' })
      return el(
        'div',
        blockProps,
        el(
          'span',
          { className: 'tracy-mega__trigger' },
          el(RichText, {
            tagName: 'span',
            className: 'tracy-mega__label',
            value: props.attributes.label,
            allowedFormats: [],
            placeholder: __('Menu label', 'wp-ja-kinetic'),
            onChange: (label) => props.setAttributes({ label })
          }),
          el('span', { className: 'tracy-mega__caret', 'aria-hidden': 'true' })
        ),
        el(
          'div',
          { className: 'tracy-mega__panel' },
          el(
            'div',
            { className: 'tracy-mega__inner' },
            el(InnerBlocks, { template: TEMPLATE, templateLock: false })
          )
        )
      )
    },
    save: () => el(InnerBlocks.Content)
  })
})(window.wp)
