/**
 * Questionnaire is a one-question-at-a-time form: the root holds the item list, each `Item` is a
 * question, and Previous/Next/Skip/Submit know on their own which of them should be visible.
 * There is no step state to keep.
 *
 * The shortcuts are the part worth trying: with `shortcuts="letters"` each choice takes a letter
 * key and Enter advances, so a whole onboarding can be answered without the mouse.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle
} from './questionnaire'

const meta: Meta<typeof Questionnaire> = {
  title: 'UI/Questionnaire',
  component: Questionnaire,
  parameters: { layout: 'centered' },
  argTypes: { shortcuts: { control: 'inline-radio', options: ['letters', 'numbers'] } },
  args: { shortcuts: 'letters' }
}
export default meta
type Story = StoryObj<typeof Questionnaire>

/** Tracy's own onboarding, as three questions. */
export const Onboarding: Story = {
  render: (args) => (
    <Questionnaire
      className="w-[30rem] rounded-lg border p-6"
      items={[
        { name: 'kind', required: true, choices: [{ value: 'new' }, { value: 'import' }] },
        {
          name: 'cms',
          required: true,
          choices: [{ value: 'wordpress' }, { value: 'joomla' }, { value: 'other' }]
        },
        { name: 'domain' }
      ]}
      onSubmit={(event) => event.preventDefault()}
      {...args}
    >
      <QuestionnaireProgress />

      <QuestionnaireItem name="kind" required>
        <QuestionnaireTitle>How should Tracy get to your site?</QuestionnaireTitle>
        <QuestionnaireDescription>You can add more sites later.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="new">
            Create a new site on the fleet
            <QuestionnaireChoiceDescription>
              Tracy provisions a container and a database for you.
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
          <QuestionnaireChoice value="import">
            Connect a site that is already running
            <QuestionnaireChoiceDescription>
              Read-only at first. You grant write access when you are ready.
            </QuestionnaireChoiceDescription>
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError>Pick one to carry on.</QuestionnaireError>
      </QuestionnaireItem>

      <QuestionnaireItem name="cms" required>
        <QuestionnaireTitle>What is the site built on?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="wordpress">WordPress</QuestionnaireChoice>
          <QuestionnaireChoice value="joomla">Joomla</QuestionnaireChoice>
          <QuestionnaireChoice value="other">Something else</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError>Pick one to carry on.</QuestionnaireError>
      </QuestionnaireItem>

      <QuestionnaireItem name="domain">
        <QuestionnaireTitle>What is the domain?</QuestionnaireTitle>
        <QuestionnaireDescription>Optional — you can add it later.</QuestionnaireDescription>
        <QuestionnaireInput placeholder="example.com" />
      </QuestionnaireItem>

      <QuestionnaireActions>
        <QuestionnairePrevious>Back</QuestionnairePrevious>
        <QuestionnaireSkip>Skip</QuestionnaireSkip>
        <QuestionnaireNext>Next</QuestionnaireNext>
        <QuestionnaireSubmit>Add site</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}

/** Multiple choice on one question, and numeric shortcuts instead of letters. */
export const MultipleChoice: Story = {
  args: { shortcuts: 'numbers' },
  render: (args) => (
    <Questionnaire
      className="w-[30rem] rounded-lg border p-6"
      items={[
        {
          name: 'panes',
          choices: [{ value: 'chat' }, { value: 'changes' }, { value: 'preview' }]
        }
      ]}
      onSubmit={(event) => event.preventDefault()}
      {...args}
    >
      <QuestionnaireProgress />
      <QuestionnaireItem name="panes" multiple>
        <QuestionnaireTitle>Which panes should open by default?</QuestionnaireTitle>
        <QuestionnaireDescription>Pick as many as you like.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="chat">Chat</QuestionnaireChoice>
          <QuestionnaireChoice value="changes">Changes</QuestionnaireChoice>
          <QuestionnaireChoice value="preview">Preview</QuestionnaireChoice>
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnaireSubmit>Save</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}
