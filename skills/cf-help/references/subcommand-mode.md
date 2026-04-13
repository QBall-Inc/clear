# Subcommand Mode -- Command + Subcommand Help

Display focused help for a specific subcommand of a CLEAR command.

## Steps

1. Validate the command name against the known list:
   `init, reload, status, knowledge, workpackage, plan, handoff, debug, help`

2. If **invalid command**, display:
   ```
   Unknown command: <command>

   Available commands:
     init, reload, status, knowledge, workpackage, plan, handoff, debug, help

   Use /cf-help for overview or /cf-help --full for all commands.
   ```

3. If **valid command**, read the skill file at `skills/cf-<command>/SKILL.md`.

4. Locate the subcommand by searching for its heading or table row in the skill file.

5. If **subcommand not found**, display:
   ```
   Unknown subcommand '<subcommand>' for /cf-<command>

   Available subcommands for /cf-<command>:
     <list of valid subcommands>

   Use /cf-help <command> for full command help.
   ```

6. If **found**, extract:
   - Subcommand syntax and options
   - Description of what it does
   - A focused example for this subcommand

## Output Format

```
/cf-<command> <subcommand> - <description>

Usage: /cf-<command> <subcommand> [options]

Options:
  <option1>  <description>
  ...

Example:
  /cf-<command> <subcommand> <example>

Full command help: /cf-help <command>
```

If no options exist, omit the Options section.
