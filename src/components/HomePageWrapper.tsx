import React from 'react';
import { HomePage as ActualHomePage } from './layout/HomePage';

// HomePage的包装组件，添加额外的防循环保护
const HomePageWrapper: React.FC = () => {
  // 简单地渲染HomePage，不进行额外的状态检查以避免循环
  return <ActualHomePage />;
};

export default HomePageWrapper;