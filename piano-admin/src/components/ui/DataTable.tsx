export default function DataTable() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="py-3 px-4 font-medium">Column 1</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-3 px-4">Row 1</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
