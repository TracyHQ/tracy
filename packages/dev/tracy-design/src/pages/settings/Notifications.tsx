import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from '@tracy/ui'

import { SettingsPage, SettingsRow, SettingsSection } from './SettingsLayout'

export function Notifications() {
  return (
    <SettingsPage>
      <SettingsSection title="Notifications">
        <SettingsRow label="Agent finishes a task" hint="When a task you started reaches a stopping point.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Agent needs a decision" hint="Permission asks and plan approvals.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Team activity" hint="Join requests, invites, and role changes.">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Scan findings" hint="When a Nightly Sync finds something new.">
          <Switch />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Delivery">
        <SettingsRow label="Sound">
          <Switch defaultChecked />
        </SettingsRow>
        <SettingsRow label="Quiet hours">
          <Select
            defaultValue="off"
            items={{ off: 'Off', night: '10 PM – 8 AM', work: 'Outside work hours' }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">Off</SelectItem>
              <SelectItem value="night">10 PM – 8 AM</SelectItem>
              <SelectItem value="work">Outside work hours</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  )
}
