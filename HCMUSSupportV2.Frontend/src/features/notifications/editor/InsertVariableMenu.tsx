import { insertDirective$, usePublisher } from '@mdxeditor/editor'
import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined'
import ArrowDropDown from '@mui/icons-material/ArrowDropDown'
import Button from '@mui/material/Button'
import ListItemText from '@mui/material/ListItemText'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { useState } from 'react'
import { use } from 'react'
import { VariableCatalogContext, variableDirectiveNode } from './variables'

/** Toolbar "Chèn biến": inserts `:var[key]` (as a chip) at the caret, from the notification's declared variables. */
export default function InsertVariableMenu() {
  const variables = use(VariableCatalogContext)
  const insertDirective = usePublisher(insertDirective$)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  return (
    <>
      <Button
        size="small"
        color="primary"
        startIcon={<DataObjectOutlined fontSize="small" />}
        endIcon={<ArrowDropDown fontSize="small" />}
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={variables.length === 0}
        aria-haspopup="menu"
        aria-expanded={anchor ? true : undefined}
        sx={{ textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        Chèn biến
      </Button>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {variables.map((v) => (
          <MenuItem
            key={v.key}
            onClick={() => {
              setAnchor(null)
              insertDirective(variableDirectiveNode(v.key))
            }}
          >
            <ListItemText primary={v.label} secondary={v.key} />
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}
