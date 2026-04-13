# Command Mode -- Command-Specific Help

Display detailed help for a single CLEAR command.

## Steps

1. Validate the command name against the known list:
   `init, reload, status, knowledge, workpackage, plan, handoff, debug, help`

2. If **invalid**, display:
   ```
   Unknown command: <command>

   Available commands:
     init, reload, status, knowledge, workpackage, plan, handoff, debug, help

   Use /cf-help for overview or /cf-help --full for all commands.
   ```

3. If **valid**, read the skill file at `skills/cf-<command>/SKILL.md`.

4. Extract from the skill file:
   - **Description** from YAML frontmatter
   - **Subcommands table** if present (parse markdown tables)
   - **2-3 usage examples** from the Examples section (if any)

5. Determine **related commands** using these categories:

   | Category | Commands |
   |----------|----------|
   | Core | init, reload, status |
   | Context | knowledge, workpackage, plan |
   | Utility | handoff, debug, help |

   Related commands are the other commands in the same category.

## Output Format

```
/cf-<command> - <description>

Subcommands:
  <subcommand>  <brief description>
  ...

Examples:
  /cf-<command> <example1>
  /cf-<command> <example2>

Related: /cf-<related1>, /cf-<related2>
```

If the command has no subcommands, omit the Subcommands section.
If no examples are found, omit the Examples section.
