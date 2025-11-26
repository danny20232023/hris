import { getHR201Pool } from '../config/hr201Database.js';

function toTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return null;
}

export const list = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM shiftscheduletypes ORDER BY shiftname');
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list shifts', error: e.message });
  }
};

export const getById = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [rows] = await pool.execute('SELECT * FROM shiftscheduletypes WHERE id = ? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to get shift', error: e.message });
  }
};

export const create = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const {
      shiftname,
      shifttimemode,
      shift_checkin,
      shift_checkin_start,
      shift_checkin_end,
      shift_checkout,
      shift_checkout_start,
      shift_checkout_end,
      is_ot,
      credits
    } = req.body || {};

    if (!shiftname || !String(shiftname).trim()) {
      return res.status(400).json({ success: false, message: 'shiftname is required' });
    }

    const sql = `INSERT INTO shiftscheduletypes (
      shiftname, shifttimemode,
      shift_checkin, shift_checkin_start, shift_checkin_end,
      shift_checkout, shift_checkout_start, shift_checkout_end,
      is_ot, credits
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    const mode = String(shifttimemode || '').toUpperCase();
    const normalizedMode = ['AM','PM','AMPM'].includes(mode) ? mode : 'AM';
    const params = [
      String(shiftname).trim(),
      normalizedMode,
      toTime(shift_checkin), toTime(shift_checkin_start), toTime(shift_checkin_end),
      toTime(shift_checkout), toTime(shift_checkout_start), toTime(shift_checkout_end),
      (is_ot ? 1 : 0), credits != null ? Number(credits) : null
    ];

    await pool.execute(sql, params);
    res.status(201).json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to create shift', error: e.message });
  }
};

export const update = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const id = req.params.id;
    const data = req.body || {};
    const fields = [
      'shiftname','shifttimemode',
      'shift_checkin','shift_checkin_start','shift_checkin_end',
      'shift_checkout','shift_checkout_start','shift_checkout_end',
      'is_ot','credits'
    ];
    const updates = [];
    const params = [];
    for (const f of fields) {
      if (data[f] !== undefined) {
        if (f === 'shiftname') {
          updates.push(`${f} = ?`); params.push(String(data[f]).trim());
        } else if (f === 'shifttimemode') {
          const mode = String(data[f] || '').toUpperCase();
          const normalizedMode = ['AM','PM','AMPM'].includes(mode) ? mode : 'AM';
          updates.push(`${f} = ?`); params.push(normalizedMode);
        } else if (f === 'is_ot') {
          updates.push(`${f} = ?`); params.push(data[f] ? 1 : 0);
        } else if (f === 'credits') {
          updates.push(`${f} = ?`); params.push(data[f] != null ? Number(data[f]) : null);
        } else {
          updates.push(`${f} = ?`); params.push(toTime(data[f]));
        }
      }
    }
    if (!updates.length) return res.json({ success: true });
    params.push(id);
    const sql = `UPDATE shiftscheduletypes SET ${updates.join(', ')} WHERE id = ?`;
    const [result] = await pool.execute(sql, params);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update shift', error: e.message });
  }
};

export const remove = async (req, res) => {
  try {
    const pool = getHR201Pool();
    const [result] = await pool.execute('DELETE FROM shiftscheduletypes WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete shift', error: e.message });
  }
};


