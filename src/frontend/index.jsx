import React, { useEffect, useState, Fragment } from 'react';
import ForgeReconciler, { Text, useProductContext, Box, Button, DynamicTable } from '@forge/react';
import { requestJira } from '@forge/bridge';

const App = () => {
  const context = useProductContext();
  const [linkedIssues, setLinkedIssues] = useState([]);
  const [sortedField, setSortedField] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [contextLoaded, setContextLoaded] = useState(false);
  const [priorityOrder, setPriorityOrder] = useState([]);

  useEffect(() => {
    if (!context || !context.extension || !context.extension.issue) {
      console.log('Waiting for context to load...');
      return;
    }
    setContextLoaded(true);
    const fetchPriorityOrder = async () => {
      try {
        const res = await requestJira('/rest/api/3/priority');
        const data = await res.json();
        console.log(data);
        if (Array.isArray(data)) {
          setPriorityOrder(data);
        } else {
          console.error('Wrong data structure', data);
        }
      } catch (error) {
        console.error('Error fetching priority ordering', error);
      }
    };

    const fetchIssueDetails = async (issueId) => {
      try {
        const res = await requestJira(`/rest/api/3/issue/${issueId}`, {
          headers: {
            'Accept': 'application/json'
          }
        });
        const data = await res.json();
        return data.fields;
      } catch (error) {
        console.error(error);
        return {};
      }
    };

    const fetchChangelog = async (issueId) => {
      try {
        const res = await requestJira(`/rest/api/3/issue/${issueId}/changelog`, {
          headers: {
            'Accept': 'application/json'
          }
        });
        const data = await res.json();
        const createdDate = data.values[0]?.created || '';
        return createdDate;
      } catch (error) {
        console.error(error);
        return '';
      }
    };

    const fetchLinkedIssues = async () => {
      try {
        await fetchPriorityOrder();
        const res = await requestJira(`/rest/api/3/issue/${context.extension.issue.id}?expand=issuelinks`);
        const data = await res.json();
        const bugs = data.fields.issuelinks
          .filter(link => link.outwardIssue && link.outwardIssue.fields.issuetype.name === 'Bug')
          .map(async (link) => {
            const issue = link.outwardIssue;
            const createdDate = await fetchChangelog(issue.id);
            const issueDetails = await fetchIssueDetails(issue.id);
            return { ...issue, createdDate, ...issueDetails };
          });

        const resolvedBugs = await Promise.all(bugs);
        setLinkedIssues(resolvedBugs);
      } catch (error) {
        console.error(error);
      }
    };
    fetchLinkedIssues();
  }, [context]);

  const handleSort = (field) => {
    const order = sortedField === field && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortedField(field);
    setSortOrder(order);

    const sortedIssues = [...linkedIssues].sort((a, b) => {
      if (field === 'priority.name') {
        const aPriority = priorityOrder.find(p => p.id === a.fields.priority?.id);
        const bPriority = priorityOrder.find(p => p.id === b.fields.priority?.id);
        const aIndex = aPriority ? priorityOrder.indexOf(aPriority) : -1;
        const bIndex = bPriority ? priorityOrder.indexOf(bPriority) : -1;
        return order === 'asc' ? aIndex - bIndex : bIndex - aIndex;
      }
      const aField = a.fields[field] || '';
      const bField = b.fields[field] || '';
      if (field === 'createdDate') {
        return order === 'asc' ? new Date(aField) - new Date(bField) : new Date(bField) - new Date(aField);
      }
      if (aField < bField) return order === 'asc' ? -1 : 1;
      if (aField > bField) return order === 'asc' ? 1 : -1;
      return 0;
    });
    setLinkedIssues(sortedIssues);
  };

  const deleteLink = async (linkId) => {
    try {
      await requestJira(`/rest/api/3/issueLink/${linkId}`, {
        method: 'DELETE',
      });
      setLinkedIssues(linkedIssues.filter(issue => issue.id !== linkId));
    } catch (error) {
      console.error('error deleting', error);
    }
  };

  const priorityStyles = {
    Low: { backgroundColor: 'color.background.success', color: 'color.text.success' },
    Medium: { backgroundColor: 'color.background.warning', color: 'color.text.warning' },
    High: { backgroundColor: 'color.background.danger', color: 'color.text.danger' },
    Highest: { backgroundColor: 'color.background.danger', color: 'color.text.danger' }
  };

  const columns = [
    { key: 'summary', content: 'Summary', isSortable: true },
    { key: 'createdDate', content: 'Create Date', isSortable: true },
    { key: 'assignee.displayName', content: 'Assignee', isSortable: true },
    { key: 'status.name', content: 'Status', isSortable: true },
    { key: 'priority.name', content: 'Priority', isSortable: true },
    { key: 'action', content: 'Action' }
  ];

  const rows = linkedIssues.map(issue => ({
    key: issue.id,
    cells: [
      { key: 'summary', content: issue.fields.summary },
      { key: 'createdDate', content: new Date(issue.createdDate).toLocaleDateString() },
      { key: 'assignee.displayName', content: issue.assignee?.displayName || 'Unassigned' },
      { key: 'status.name', content: issue.fields.status.name },
      { key: 'priority.name', content: (
        <Box
          padding='space.100'
          backgroundColor={priorityStyles[issue.fields.priority?.name]?.backgroundColor || 'color.background.default'}
          color={priorityStyles[issue.fields.priority?.name]?.color || 'color.text.default'}
        >
          {issue.fields.priority?.name || 'No Priority'}
        </Box>
      )},
      { key: 'action', content: (
        <Button
          onClick={() => deleteLink(issue.id)}
        >
          Delete Link
        </Button>
      )}
    ]
  }));

  if (!contextLoaded) {
    return <Text>Loading...</Text>;
  }

  return (
    <Fragment>
      <DynamicTable
        columns={columns}
        rows={rows}
        defaultSortKey={sortedField}
        defaultSortOrder={sortOrder}
        onSort={(sortKey) => handleSort(sortKey)}
      />
    </Fragment>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
