import type { IconKey } from '@mdxeditor/editor'
import type { SvgIconComponent } from '@mui/icons-material'
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import ArrowDropDownOutlined from '@mui/icons-material/ArrowDropDownOutlined'
import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import BorderColorOutlined from '@mui/icons-material/BorderColorOutlined'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import ChecklistOutlined from '@mui/icons-material/ChecklistOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import CodeOutlined from '@mui/icons-material/CodeOutlined'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DataObjectOutlined from '@mui/icons-material/DataObjectOutlined'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import DifferenceOutlined from '@mui/icons-material/DifferenceOutlined'
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import FormatAlignCenterOutlined from '@mui/icons-material/FormatAlignCenterOutlined'
import FormatAlignLeftOutlined from '@mui/icons-material/FormatAlignLeftOutlined'
import FormatAlignRightOutlined from '@mui/icons-material/FormatAlignRightOutlined'
import FormatBoldOutlined from '@mui/icons-material/FormatBoldOutlined'
import FormatItalicOutlined from '@mui/icons-material/FormatItalicOutlined'
import FormatListBulletedOutlined from '@mui/icons-material/FormatListBulletedOutlined'
import FormatListNumberedOutlined from '@mui/icons-material/FormatListNumberedOutlined'
import FormatUnderlinedOutlined from '@mui/icons-material/FormatUnderlinedOutlined'
import HorizontalRuleOutlined from '@mui/icons-material/HorizontalRuleOutlined'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import KeyboardDoubleArrowDownOutlined from '@mui/icons-material/KeyboardDoubleArrowDownOutlined'
import KeyboardDoubleArrowLeftOutlined from '@mui/icons-material/KeyboardDoubleArrowLeftOutlined'
import KeyboardDoubleArrowRightOutlined from '@mui/icons-material/KeyboardDoubleArrowRightOutlined'
import KeyboardDoubleArrowUpOutlined from '@mui/icons-material/KeyboardDoubleArrowUpOutlined'
import LinkOffOutlined from '@mui/icons-material/LinkOffOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import RedoOutlined from '@mui/icons-material/RedoOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import StrikethroughSOutlined from '@mui/icons-material/StrikethroughSOutlined'
import SubscriptOutlined from '@mui/icons-material/SubscriptOutlined'
import SuperscriptOutlined from '@mui/icons-material/SuperscriptOutlined'
import TableChartOutlined from '@mui/icons-material/TableChartOutlined'
import TableRowsOutlined from '@mui/icons-material/TableRowsOutlined'
import TextSnippetOutlined from '@mui/icons-material/TextSnippetOutlined'
import UndoOutlined from '@mui/icons-material/UndoOutlined'
import ViewColumnOutlined from '@mui/icons-material/ViewColumnOutlined'

const ICONS: Record<IconKey, SvgIconComponent> = {
  undo: UndoOutlined,
  redo: RedoOutlined,
  format_bold: FormatBoldOutlined,
  format_italic: FormatItalicOutlined,
  format_underlined: FormatUnderlinedOutlined,
  code: CodeOutlined,
  strikeThrough: StrikethroughSOutlined,
  superscript: SuperscriptOutlined,
  subscript: SubscriptOutlined,
  format_list_bulleted: FormatListBulletedOutlined,
  format_list_numbered: FormatListNumberedOutlined,
  format_list_checked: ChecklistOutlined,
  format_highlight: BorderColorOutlined,
  link: LinkOutlined,
  add_photo: AddPhotoAlternateOutlined,
  table: TableChartOutlined,
  horizontal_rule: HorizontalRuleOutlined,
  frontmatter: ArticleOutlined,
  frame_source: DataObjectOutlined,
  arrow_drop_down: ArrowDropDownOutlined,
  admonition: InfoOutlined,
  rich_text: EditNoteOutlined,
  difference: DifferenceOutlined,
  markdown: TextSnippetOutlined,
  open_in_new: OpenInNewOutlined,
  link_off: LinkOffOutlined,
  edit: EditOutlined,
  content_copy: ContentCopyOutlined,
  more_horiz: MoreHorizOutlined,
  more_vert: MoreVertOutlined,
  close: CloseOutlined,
  settings: SettingsOutlined,
  delete_big: DeleteOutlined,
  delete_small: DeleteOutlineOutlined,
  format_align_center: FormatAlignCenterOutlined,
  format_align_left: FormatAlignLeftOutlined,
  format_align_right: FormatAlignRightOutlined,
  add_row: TableRowsOutlined,
  add_column: ViewColumnOutlined,
  insert_col_left: KeyboardDoubleArrowLeftOutlined,
  insert_row_above: KeyboardDoubleArrowUpOutlined,
  insert_row_below: KeyboardDoubleArrowDownOutlined,
  insert_col_right: KeyboardDoubleArrowRightOutlined,
  check: CheckOutlined,
}

/** `MDXEditor iconComponentFor`: Material (outlined) icons instead of MDXEditor's built-in SVGs. */
export function iconComponentFor(name: IconKey) {
  const Icon = ICONS[name]
  return <Icon sx={{ fontSize: 20 }} />
}
