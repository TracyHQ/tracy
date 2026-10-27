/* wp-ja-vega/mega-menu — the editor side, plain script against the wp.* globals: no JSX, no
 * build. The block's metadata (title, attributes, supports) comes from block.json through the
 * server registration; this file only says how it edits and what it saves. In the editor the
 * panel is always open and sits in the flow (`jv-mega--editing`), so its columns can be
 * edited like any other inner blocks; the trigger label is edited in place, the link it goes to in the block's sidebar. */
;((wp) => {
  const el = wp.element.createElement
  const { registerBlockType } = wp.blocks
  const { InnerBlocks, RichText, useBlockProps, InspectorControls } = wp.blockEditor
  const { PanelBody, TextControl } = wp.components
  const { __ } = wp.i18n

  const TEMPLATE = [
    [
      'core/columns',
      { className: 'jv-mega__columns' },
      [
        [
          'core/column',
          {},
          [
            [
              'core/heading',
              { level: 3, className: 'jv-mega__title', placeholder: __('Column title', 'wp-ja-vega') }
            ],
            ['core/list', { className: 'jv-mega__links' }, [['core/list-item', {}]]]
          ]
        ],
        [
          'core/column',
          {},
          [
            [
              'core/heading',
              { level: 3, className: 'jv-mega__title', placeholder: __('Column title', 'wp-ja-vega') }
            ],
            [
              'core/paragraph',
              {
                className: 'jv-mega__feature',
                placeholder: __('A sentence about this section', 'wp-ja-vega')
              }
            ]
          ]
        ]
      ]
    ]
  ]

  registerBlockType('wp-ja-vega/mega-menu', {
    edit: (props) => {
      const blockProps = useBlockProps({ className: 'jv-mega jv-mega--editing' })
      return el(
        'div',
        blockProps,
        el(
          InspectorControls,
          {},
          el(
            PanelBody,
            { title: __('Link', 'wp-ja-vega') },
            el(TextControl, {
              label: __('The page the label goes to', 'wp-ja-vega'),
              value: props.attributes.url,
              onChange: (url) => props.setAttributes({ url })
            })
          )
        ),
        el(
          'span',
          { className: 'jv-mega__trigger' },
          el(RichText, {
            tagName: 'span',
            className: 'jv-mega__label',
            value: props.attributes.label,
            allowedFormats: [],
            placeholder: __('Menu label', 'wp-ja-vega'),
            onChange: (label) => props.setAttributes({ label })
          }),
          el('span', { className: 'jv-mega__caret', 'aria-hidden': 'true' })
        ),
        el(
          'div',
          { className: 'jv-mega__panel' },
          el(
            'div',
            { className: 'jv-mega__inner' },
            el(InnerBlocks, { template: TEMPLATE, templateLock: false })
          )
        )
      )
    },
    save: () => el(InnerBlocks.Content)
  })
})(window.wp)
