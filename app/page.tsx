'use client';
import React from 'react';
import { Layout, Typography, Steps, Card, Button, Progress, Alert, Space, theme, Badge } from 'antd';
import { LeftOutlined, RightOutlined, ExportOutlined, SaveOutlined, FileAddOutlined, FileTextOutlined, InfoCircleOutlined, FilePdfOutlined, FormOutlined, FileDoneOutlined } from '@ant-design/icons';
import PdfUploader from '@/components/pdf-uploader';
import AnnotationCanvas from '@/components/annotation-canvas';
import { AnnotationProvider } from '@/context/annotation-context';
import { useDocument } from '@/context/document-context';

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;

export default function Home() {
  const { token } = theme.useToken();
  const { state, handlePageNavigation, handleExport } = useDocument();
  const { currentStep, imageUrls, currentPageIndex, annotatedImages, progress, error } = state;  

  // Map current step to Steps component index
  const getStepIndex = () => {
    switch(currentStep) {
      case 'upload': return 0;
      case 'annotate': return 1;
      case 'export': return 2;
      default: return 0;
    }
  };
  
  const stepItems = [
    {
      title: 'Upload',
      description: 'Select PDF file',
    },
    {
      title: 'Annotate',
      description: 'Edit document',
    },
    {
      title: 'Export',
      description: 'Download result',
    }
  ];

  // Render page navigation controls
  const renderPageNavigation = () => (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
      <div className="flex items-center gap-5">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: token.colorBgLayout }}>
          <Badge count={Object.keys(annotatedImages).length} showZero color={token.colorSuccess}>
            <FileTextOutlined style={{ fontSize: '20px', color: token.colorPrimary }} />
          </Badge>
        </div>
        <div>
          <Title level={4} className="mb-0">
            Page {currentPageIndex + 1} of {imageUrls.length}
          </Title>
        </div>
      </div>
      
      <Space wrap className="self-start sm:self-auto">
        <Button
          icon={<LeftOutlined />}
          onClick={() => handlePageNavigation(currentPageIndex - 1)}
          disabled={currentPageIndex === 0}
        >
          Previous
        </Button>
        <Button
          type="primary"
          icon={<RightOutlined />}
          onClick={() => handlePageNavigation(currentPageIndex + 1)}
          disabled={currentPageIndex === imageUrls.length - 1}
        >
          Next
        </Button>
      </Space>
    </div>
  );

  return (
    <Layout className="min-h-screen" style={{ background: `linear-gradient(to bottom, ${token.colorBgLayout}, ${token.colorBgContainer})` }}>
      <Content className="h-screen p-3 sm:p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="flex flex-col max-w-6xl mx-auto">
          {/* App Header */}
          <div className="text-center mb-4 sm:mb-6">
            <Title level={2} className="mb-1 text-2xl sm:text-3xl md:text-4xl lg:text-5xl" style={{ color: token.colorPrimary }}>
              GhostWrite
            </Title>
            <Text type="secondary" className="text-sm sm:text-base md:text-lg">
              Effortlessly edit and annotate your PDF documents with AI
            </Text>
          </div>
          
          <div className='flex bg-white rounded-xl shadow-md mb-4 sm:mb-6 p-3 p-sm-5'>
            <Steps
              current={getStepIndex()}
              items={stepItems}
              responsive
              size="small"
              className="w-full"
            />
          </div>
          <Card 
            className="shadow-xl border-0 rounded-2xl overflow-visible"
            styles={{
              body: { padding: '12px sm:24px' }
            }}
          >
            
            {/* Upload Step */}
            {currentStep === 'upload' && (
              <div className="flex flex-col items-center p-4 sm:p-8 md:p-16">
                <div className="w-full max-w-2xl">
                  <PdfUploader />
                </div>
              </div>
            )}
            
            {/* Annotate Step */}
            {currentStep === 'annotate' && imageUrls.length > 0 && (
              <AnnotationProvider>
                <div className="flex flex-col h-full">
                  {renderPageNavigation()}
                  
                  <div className="mb-5">
                    <AnnotationCanvas key={`page-${currentPageIndex}`}/>
                  </div>

                  <div className="mt-auto">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-4">
                      <Button
                        type="primary"
                        size="large"
                        icon={<ExportOutlined />}
                        onClick={handleExport}
                        className="w-full sm:w-auto order-2 sm:order-1 py-2 sm:py-3 h-auto rounded-lg"
                        style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
                      >
                        <span className="text-sm sm:text-base">Export Annotated PDF</span>
                      </Button>
                      <Text type="secondary" className="order-1 sm:order-2 text-center sm:text-right text-xs sm:text-sm">
                        Preview is updated in real-time
                      </Text>
                    </div>
                  </div>
                </div>
              </AnnotationProvider>
            )}
            
            {currentStep === 'export' && (
              <div className="p-3 sm:p-6 flex justify-center">
                <Card className="w-full max-w-lg shadow-md text-center border-0 rounded-lg overflow-hidden">
                  <Title level={4} className="mb-4 sm:mb-6">Processing Your Document</Title>
                  
                  {error ? (
                    <Alert
                      message="Error"
                      description={error}
                      type="error"
                      showIcon
                      className="mb-4"
                    />
                  ) : (
                    <div className="max-w-md mx-auto">
                      <Progress 
                        percent={progress} 
                        status="active" 
                        className="mb-4 sm:mb-6" 
                        trailColor={token.colorBgLayout}
                      />
                      <Paragraph className="text-sm sm:text-base" type="secondary">
                        Please wait while we process your annotations and prepare your document for download...
                      </Paragraph>
                    </div>
                  )}
                </Card>
              </div>
            )}
          </Card>
        </div>
      </Content>
    </Layout>
  );
}